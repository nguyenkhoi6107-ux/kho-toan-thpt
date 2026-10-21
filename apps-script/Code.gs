/**
 * ToánKho – Máy chủ chấm bài kiểm tra học sinh trên Google Apps Script
 * Lưu trong repo: apps-script/Code.gs (Không chứa mã giáo viên; mã giáo viên cất trong Script Properties: TEACHER_CODE)
 *
 * Cấu trúc Google Sheet (3 tab):
 * 1. "Bài kiểm tra": Mã bài | Tên bài | Chế độ | Thời gian làm (phút) | Giờ mở | Giờ đóng | Đảo câu | Đảo phương án | Tổng điểm thô tối đa | Nội dung đề (JSON) | Ngày tạo
 * 2. "Đáp án": Mã bài | Mã câu | Thứ tự gốc | Loại câu | Đáp án đúng | Lời giải chi tiết | Câu gốc (biến thể) | Dạng toán
 * 3. "Kết quả": Mã phiên | Mã bài | Giờ bắt đầu | Giờ nộp | Họ tên | Lớp | Điểm (thang 10) | Điểm thô | Cờ nộp nhiều lần | Cờ quá giờ | Chi tiết từng câu | Bài làm (JSON)
 */

var SHEET_NAMES = {
  EXAMS: 'Bài kiểm tra',
  ANSWERS: 'Đáp án',
  RESULTS: 'Kết quả'
};

var CACHE_TTL_SECONDS = 60; // Mỗi cache 1 phút theo quyết định của giáo viên
var GRACE_PERIOD_MS = 60 * 1000; // Ân hạn nộp trễ 1 phút

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return handleRequest(params);
}

function doPost(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'INVALID_JSON', message: 'Dữ liệu gửi lên không đúng định dạng JSON.' });
    }
  }
  return handleRequest(body);
}

function handleRequest(req) {
  var action = String(req.action || '').trim();
  try {
    switch (action) {
      case 'createExam':
        return jsonResponse(createExam(req));
      case 'getExamInfo':
        return jsonResponse(getExamInfo(req));
      case 'startExam':
        return jsonResponse(startExam(req));
      case 'submitExam':
        return jsonResponse(submitExam(req));
      case 'getReview':
        return jsonResponse(getReview(req));
      case 'joinLiveRoom':
        return jsonResponse(joinLiveRoom(req));
      case 'saveLiveResults':
        return jsonResponse(saveLiveResults(req));
      default:
        return jsonResponse({ ok: false, error: 'UNKNOWN_ACTION', message: 'Hành động không hợp lệ: ' + action });
    }
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: 'SERVER_ERROR',
      message: err && err.message ? err.message : String(err)
    });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Lấy thông tin tóm tắt của đề kiểm tra cho trang đầu (Tên bài, Thời gian làm bài, Số lượng câu hỏi từng phần)
 * Không trả về nội dung câu hỏi hay đáp án trước khi học sinh bấm "Bắt đầu".
 */
function getExamInfo(req) {
  var examCode = String(req.examCode || '').trim().toUpperCase();
  if (!examCode) {
    return { ok: false, error: 'MISSING_CODE', message: 'Vui lòng nhập mã bài kiểm tra.' };
  }
  var exam = getExamDataCached(examCode);
  if (!exam) {
    return { ok: false, error: 'EXAM_NOT_FOUND', message: 'Không tìm thấy mã bài kiểm tra: ' + examCode };
  }

  var nowMs = Date.now();
  var counts = { TN4: 0, DS: 0, TLN: 0, TL: 0, total: 0 };
  var qs = Array.isArray(exam.questions) ? exam.questions : [];
  for (var i = 0; i < qs.length; i++) {
    var t = String(qs[i].loai || qs[i].type || 'TN4').toUpperCase();
    if (counts[t] !== undefined) counts[t]++;
    counts.total++;
  }

  var status = 'OPEN';
  if (exam.openTimeMs && nowMs < exam.openTimeMs) status = 'NOT_OPEN';
  else if (exam.closeTimeMs && nowMs > exam.closeTimeMs) status = 'CLOSED';

  return {
    ok: true,
    examCode: exam.examCode,
    title: exam.title,
    mode: exam.mode,
    durationMinutes: exam.durationMinutes,
    openTime: exam.openTime,
    closeTime: exam.closeTime,
    openTimeMs: exam.openTimeMs,
    closeTimeMs: exam.closeTimeMs,
    serverNowMs: nowMs,
    status: status,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleChoices: exam.shuffleChoices,
    maxRawScore: exam.maxRawScore,
    counts: counts
  };
}

/**
 * Chuẩn hóa chuỗi họ tên / lớp để so trùng:
 * Bỏ dấu cách thừa, chuyển về chữ thường
 */
function normalizeIdentity(str) {
  return String(str || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Chuẩn hóa câu trả lời ngắn (TLN) theo quy tắc đã chốt:
 * - Bỏ khoảng trắng
 * - Chuẩn hóa dấu trừ Unicode (−, –, —) thành dấu trừ chuẩn (-)
 * - Coi "," và "." như nhau (đổi "," thành ".")
 * - Giữ nguyên độ làm tròn theo đúng đáp án (so khớp chuỗi sau chuẩn hóa)
 */
function normalizeShortAnswer(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.');
}

function getMaxRawScoreForQuestion(type) {
  var t = String(type || '').toUpperCase();
  if (t === 'TN4') return 0.25;
  if (t === 'DS') return 1.0;
  if (t === 'TLN') return 0.5;
  return 0;
}

/**
 * Chấm 1 câu Đúng/Sai theo thang điểm tốt nghiệp THPT 2025:
 * Đúng 1 ý: 0,1 | 2 ý: 0,25 | 3 ý: 0,5 | 4 ý: 1,0
 * Hỗ trợ đáp án dạng "ĐSĐS" (chuẩn ToánKho), "Đ-S-Đ-S", mảng ['Đ','S','Đ','S'], hoặc object {a:'Đ',b:'S',c:'Đ',d:'S'}
 */
function scoreTrueFalseQuestion(studentAns, correctAns) {
  var keys = ['a', 'b', 'c', 'd'];
  var correctMap = parseDSMap(correctAns);
  var studentMap = parseDSMap(studentAns);

  var correctCount = 0;
  for (var m = 0; m < keys.length; m++) {
    var key = keys[m];
    var sVal = studentMap[key];
    var cVal = correctMap[key];
    if (sVal && cVal && sVal === cVal) {
      correctCount++;
    }
  }

  var scoreTable = [0, 0.1, 0.25, 0.5, 1.0];
  return {
    correctCount: correctCount,
    rawScore: scoreTable[correctCount] || 0
  };
}

function parseDSMap(val) {
  var keys = ['a', 'b', 'c', 'd'];
  var out = { a: '', b: '', c: '', d: '' };
  if (!val) return out;

  if (typeof val === 'string') {
    var s = val.trim();
    if (s.indexOf('{') === 0 || s.indexOf('[') === 0) {
      try {
        return parseDSMap(JSON.parse(s));
      } catch (e) {}
    }
    var parts = s.indexOf('-') !== -1 || s.indexOf(',') !== -1 || s.indexOf(';') !== -1
      ? s.split(/[-,;|\s]+/).filter(Boolean)
      : s.replace(/\s+/g, '').split('');
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = normalizeDSValue(parts[i]);
    }
    return out;
  }

  if (Array.isArray(val)) {
    for (var a = 0; a < keys.length; a++) {
      out[keys[a]] = normalizeDSValue(val[a]);
    }
    return out;
  }

  if (typeof val === 'object') {
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      out[k] = normalizeDSValue(val[k] !== undefined ? val[k] : val[j]);
    }
  }
  return out;
}

function normalizeDSValue(v) {
  if (v === true) return 'D';
  if (v === false) return 'S';
  var s = String(v || '').trim().toUpperCase();
  if (s === 'Đ' || s === 'D' || s === 'TRUE' || s === '1') return 'D';
  if (s === 'S' || s === 'FALSE' || s === '0') return 'S';
  return '';
}

/**
 * 1. Giáo viên giao bài từ ToánKho
 */
function createExam(req) {
  var teacherCodeProp = PropertiesService.getScriptProperties().getProperty('TEACHER_CODE');
  if (!teacherCodeProp || String(req.teacherCode || '').trim() !== String(teacherCodeProp).trim()) {
    return { ok: false, error: 'UNAUTHORIZED', message: 'Sai mã giáo viên.' };
  }

  var questions = Array.isArray(req.questions) ? req.questions : [];
  if (questions.length === 0) {
    return { ok: false, error: 'EMPTY_QUESTIONS', message: 'Đề kiểm tra phải có ít nhất 1 câu hỏi.' };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'SERVER_BUSY', message: 'Máy chủ đang bận, vui lòng thử lại sau vài giây.' };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var examSheet = ss.getSheetByName(SHEET_NAMES.EXAMS);
    var ansSheet = ss.getSheetByName(SHEET_NAMES.ANSWERS);

    var examCode = generateUniqueExamCode(examSheet);
    var maxRawScore = 0;
    var publicQuestions = [];
    var answerRows = [];

    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      var qId = String(q.ma || q.id || ('C' + (i + 1))).trim();
      var qType = String(q.loai || q.type || 'TN4').toUpperCase();
      maxRawScore += getMaxRawScoreForQuestion(qType);

      // Chuẩn hóa danh sách lựa chọn TN4 & ý Đúng/Sai cho trang học sinh (TUYỆT ĐỐI KHÔNG chứa đáp án và lời giải)
      var choicesArr = [];
      if (Array.isArray(q.choices)) {
        choicesArr = q.choices;
      } else if (q.choices && typeof q.choices === 'object') {
        choicesArr = [q.choices.A || '', q.choices.B || '', q.choices.C || '', q.choices.D || ''];
      }

      var tfArr = [];
      if (Array.isArray(q.tf)) {
        tfArr = q.tf;
      } else if (q.items && typeof q.items === 'object') {
        tfArr = [q.items.a || '', q.items.b || '', q.items.c || '', q.items.d || ''];
      }

      var hinhArr = Array.isArray(q.hinh)
        ? q.hinh.map(function (f) { return { id: f.id || '', svg: f.svg || null }; })
        : (q.svg ? [{ id: qId + '-q1', svg: q.svg }] : []);

      publicQuestions.push({
        ma: qId,
        id: qId,
        order: i + 1,
        loai: qType,
        type: qType,
        de: q.de || q.stem || '',
        stem: q.de || q.stem || '',
        choices: choicesArr,
        tf: tfArr,
        hinh: hinhArr
      });

      var rawAns = q.dap_an !== undefined ? q.dap_an : q.answer;
      var ansValue = (typeof rawAns === 'object' && rawAns !== null)
        ? JSON.stringify(rawAns)
        : String(rawAns !== undefined ? rawAns : '');

      var solObj = {
        loigiai: q.loigiai || q.solution || '',
        hinh_lg: Array.isArray(q.hinh_lg)
          ? q.hinh_lg.map(function (f) { return { id: f.id || '', svg: f.svg || null }; })
          : []
      };

      answerRows.push([
        examCode,
        qId,
        i + 1,
        qType,
        ansValue,
        JSON.stringify(solObj),
        q.cau_goc || q.baseQuestionId || qId,
        q.dang || q.topic || ''
      ]);
    }

    maxRawScore = Math.round(maxRawScore * 100) / 100;
    var nowIso = new Date().toISOString();

    examSheet.appendRow([
      examCode,
      req.title || ('Bài kiểm tra ' + examCode),
      req.mode || 'tu_lam',
      Number(req.durationMinutes || 15),
      req.openTime || '',
      req.closeTime || '',
      Boolean(req.shuffleQuestions),
      Boolean(req.shuffleChoices),
      maxRawScore,
      JSON.stringify(publicQuestions),
      nowIso
    ]);

    for (var r = 0; r < answerRows.length; r++) {
      ansSheet.appendRow(answerRows[r]);
    }

    CacheService.getScriptCache().remove('EXAM_' + examCode);
    CacheService.getScriptCache().remove('ANS_' + examCode);

    return {
      ok: true,
      examCode: examCode,
      maxRawScore: maxRawScore,
      createdAt: nowIso
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 2. Học sinh bấm "Bắt đầu"
 */
function startExam(req) {
  var examCode = String(req.examCode || '').trim().toUpperCase();
  var studentName = String(req.studentName || '').trim();
  var className = String(req.className || '').trim();

  if (!examCode || !studentName || !className) {
    return { ok: false, error: 'MISSING_INFO', message: 'Vui lòng nhập đầy đủ Họ tên, Lớp và Mã bài.' };
  }

  var exam = getExamDataCached(examCode);
  if (!exam) {
    return { ok: false, error: 'EXAM_NOT_FOUND', message: 'Không tìm thấy mã bài kiểm tra: ' + examCode };
  }

  var nowMs = Date.now();
  if (exam.openTimeMs && nowMs < exam.openTimeMs) {
    return {
      ok: false,
      error: 'EXAM_NOT_OPEN',
      message: 'Bài kiểm tra chưa đến giờ mở.',
      openTime: exam.openTime
    };
  }
  if (exam.closeTimeMs && nowMs > exam.closeTimeMs) {
    return {
      ok: false,
      error: 'EXAM_CLOSED',
      message: 'Bài kiểm tra đã đóng.',
      closeTime: exam.closeTime,
      canReview: true
    };
  }

  var normKey = examCode + '|' + normalizeIdentity(studentName) + '|' + normalizeIdentity(className);
  var cache = CacheService.getScriptCache();

  var activeSessionRaw = cache.get('ACTIVE_SESSION_' + normKey);
  if (activeSessionRaw) {
    try {
      var activeSession = JSON.parse(activeSessionRaw);
      if (!activeSession.submitted && nowMs < activeSession.deadlineMs) {
        return {
          ok: true,
          restored: true,
          sessionId: activeSession.sessionId,
          examCode: examCode,
          title: exam.title,
          mode: exam.mode,
          durationMinutes: exam.durationMinutes,
          startTimeMs: activeSession.startTimeMs,
          deadlineMs: activeSession.deadlineMs,
          serverNowMs: nowMs,
          shuffleQuestions: exam.shuffleQuestions,
          shuffleChoices: exam.shuffleChoices,
          questions: exam.questions
        };
      }
    } catch (e) {}
  }

  var durationMs = exam.durationMinutes * 60 * 1000;
  var deadlineMs = nowMs + durationMs;
  if (exam.closeTimeMs && exam.closeTimeMs < deadlineMs) {
    deadlineMs = exam.closeTimeMs;
  }

  var sessionId = 'S_' + Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase();
  var sessionData = {
    sessionId: sessionId,
    examCode: examCode,
    studentName: studentName,
    className: className,
    normKey: normKey,
    startTimeMs: nowMs,
    startTimeIso: new Date(nowMs).toISOString(),
    deadlineMs: deadlineMs,
    submitted: false
  };

  cache.put('SESSION_' + sessionId, JSON.stringify(sessionData), 21600);
  cache.put('ACTIVE_SESSION_' + normKey, JSON.stringify(sessionData), 21600);

  return {
    ok: true,
    restored: false,
    sessionId: sessionId,
    examCode: examCode,
    title: exam.title,
    mode: exam.mode,
    durationMinutes: exam.durationMinutes,
    startTimeMs: nowMs,
    deadlineMs: deadlineMs,
    serverNowMs: nowMs,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleChoices: exam.shuffleChoices,
    questions: exam.questions
  };
}

/**
 * 3. Học sinh nộp bài
 */
function submitExam(req) {
  var sessionId = String(req.sessionId || '').trim();
  var examCode = String(req.examCode || '').trim().toUpperCase();
  var answers = (req.answers && typeof req.answers === 'object') ? req.answers : {};

  var cache = CacheService.getScriptCache();
  var sessionRaw = cache.get('SESSION_' + sessionId);
  var session = null;
  if (sessionRaw) {
    try {
      session = JSON.parse(sessionRaw);
    } catch (e) {}
  }

  if (!session) {
    if (!examCode || !req.studentName || !req.className) {
      return { ok: false, error: 'INVALID_SESSION', message: 'Không tìm thấy phiên làm bài hợp lệ.' };
    }
    session = {
      sessionId: sessionId || ('S_FALLBACK_' + Date.now()),
      examCode: examCode,
      studentName: String(req.studentName).trim(),
      className: String(req.className).trim(),
      normKey: examCode + '|' + normalizeIdentity(req.studentName) + '|' + normalizeIdentity(req.className),
      startTimeMs: Number(req.startTimeMs || Date.now()),
      startTimeIso: new Date(Number(req.startTimeMs || Date.now())).toISOString(),
      deadlineMs: Number(req.deadlineMs || Date.now())
    };
  }

  var exam = getExamDataCached(session.examCode);
  var answerKeyMap = getAnswerKeyCached(session.examCode);
  if (!exam || !answerKeyMap) {
    return { ok: false, error: 'EXAM_NOT_FOUND', message: 'Không tìm thấy dữ liệu đề hoặc đáp án.' };
  }

  var submitMs = Date.now();
  var submitIso = new Date(submitMs).toISOString();

  var effectiveDeadlineMs = session.deadlineMs;
  if (exam.closeTimeMs && exam.closeTimeMs < effectiveDeadlineMs) {
    effectiveDeadlineMs = exam.closeTimeMs;
  }
  var isLate = submitMs > (effectiveDeadlineMs + GRACE_PERIOD_MS);
  var lateFlag = isLate ? 'quá giờ' : '';

  var totalRawScore = 0;
  var maxRawScore = 0;
  var perQuestionSummary = [];

  for (var i = 0; i < exam.questions.length; i++) {
    var q = exam.questions[i];
    var qId = q.ma || q.id;
    var qType = String(q.loai || q.type || 'TN4').toUpperCase();
    var keyInfo = answerKeyMap[qId] || {};
    var studentAns = answers[qId];
    var qRaw = 0;
    var qMax = getMaxRawScoreForQuestion(qType);
    maxRawScore += qMax;

    if (qType === 'TN4') {
      var sChoice = String(studentAns || '').trim().toUpperCase();
      var cChoice = String(keyInfo.answer || '').trim().toUpperCase();
      var isCorrectTN = (sChoice !== '' && sChoice === cChoice);
      qRaw = isCorrectTN ? 0.25 : 0;
      perQuestionSummary.push(qId + ': ' + (isCorrectTN ? 'Đúng (0.25)' : 'Sai (0)'));
    } else if (qType === 'DS') {
      var dsResult = scoreTrueFalseQuestion(studentAns, keyInfo.parsedAnswer || keyInfo.answer);
      qRaw = dsResult.rawScore;
      perQuestionSummary.push(qId + ': ' + dsResult.correctCount + '/4 ý (' + qRaw + ')');
    } else if (qType === 'TLN') {
      var sNorm = normalizeShortAnswer(studentAns);
      var cNorm = normalizeShortAnswer(keyInfo.answer);
      var isCorrectTLN = (sNorm !== '' && sNorm === cNorm);
      qRaw = isCorrectTLN ? 0.5 : 0;
      perQuestionSummary.push(qId + ': ' + (isCorrectTLN ? 'Đúng (0.5)' : 'Sai (0)'));
    }

    totalRawScore += qRaw;
  }

  totalRawScore = Math.round(totalRawScore * 100) / 100;
  maxRawScore = Math.round((exam.maxRawScore || maxRawScore) * 100) / 100;

  var scaledScore10 = maxRawScore > 0
    ? Math.round((10 * totalRawScore / maxRawScore) * 100) / 100
    : 0;
  var rawScoreDisplay = totalRawScore + ' / ' + maxRawScore;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return {
      ok: false,
      error: 'SERVER_BUSY',
      retryable: true,
      message: 'Máy chủ đang bận chấm bài cho các bạn khác, trang sẽ tự gửi lại.'
    };
  }

  var duplicateFlag = '';
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var resultSheet = ss.getSheetByName(SHEET_NAMES.RESULTS);
    var lastRow = resultSheet.getLastRow();

    if (lastRow >= 2) {
      var existingData = resultSheet.getRange(2, 2, lastRow - 1, 5).getValues();
      var targetExam = session.examCode;
      var targetName = normalizeIdentity(session.studentName);
      var targetClass = normalizeIdentity(session.className);

      for (var r = 0; r < existingData.length; r++) {
        var rowExam = String(existingData[r][0] || '').trim().toUpperCase();
        var rowName = normalizeIdentity(existingData[r][3]);
        var rowClass = normalizeIdentity(existingData[r][4]);
        if (rowExam === targetExam && rowName === targetName && rowClass === targetClass) {
          duplicateFlag = 'nộp nhiều lần';
          break;
        }
      }
    }

    resultSheet.appendRow([
      session.sessionId,
      session.examCode,
      session.startTimeIso,
      submitIso,
      session.studentName,
      session.className,
      scaledScore10,
      rawScoreDisplay,
      duplicateFlag,
      lateFlag,
      perQuestionSummary.join(' | '),
      JSON.stringify(answers)
    ]);

    session.submitted = true;
    cache.put('SESSION_' + session.sessionId, JSON.stringify(session), 21600);
    cache.remove('ACTIVE_SESSION_' + session.normKey);
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true,
    sessionId: session.sessionId,
    examCode: session.examCode,
    studentName: session.studentName,
    className: session.className,
    score10: scaledScore10,
    rawScore: totalRawScore,
    maxRawScore: maxRawScore,
    rawScoreDisplay: rawScoreDisplay,
    duplicateFlag: duplicateFlag,
    lateFlag: lateFlag,
    submittedAt: submitIso,
    canReviewNow: Boolean(exam.closeTimeMs && submitMs > exam.closeTimeMs)
  };
}

/**
 * 4. Xem đáp án và lời giải sau giờ đóng bài
 */
function getReview(req) {
  var examCode = String(req.examCode || '').trim().toUpperCase();
  var exam = getExamDataCached(examCode);
  if (!exam) {
    return { ok: false, error: 'EXAM_NOT_FOUND', message: 'Không tìm thấy bài kiểm tra.' };
  }

  var nowMs = Date.now();
  if (!exam.closeTimeMs || nowMs <= exam.closeTimeMs) {
    return {
      ok: false,
      error: 'NOT_CLOSED_YET',
      message: 'Chỉ được xem đáp án và lời giải sau giờ đóng bài.',
      closeTime: exam.closeTime,
      serverNowMs: nowMs
    };
  }

  var answerKeyMap = getAnswerKeyCached(examCode);
  return {
    ok: true,
    examCode: examCode,
    title: exam.title,
    questions: exam.questions,
    answers: answerKeyMap
  };
}

/**
 * 5. Chế độ thi cùng lúc (Cách b): Cấp sessionToken riêng cho từng học sinh khi vào phòng
 */
function joinLiveRoom(req) {
  var examCode = String(req.examCode || '').trim().toUpperCase();
  var studentName = String(req.studentName || '').trim();
  var className = String(req.className || '').trim();
  if (!examCode || !studentName || !className) {
    return { ok: false, error: 'MISSING_INFO', message: 'Vui lòng nhập Họ tên, Lớp và Mã phòng.' };
  }
  var sessionToken = 'LIVE_' + Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  return {
    ok: true,
    examCode: examCode,
    studentName: studentName,
    className: className,
    sessionToken: sessionToken,
    issuedAtMs: Date.now()
  };
}

/**
 * 6. Chế độ thi cùng lúc (Cách b): Cuối buổi màn hình giáo viên ghi kết quả 1 lần vào Sheet
 */
function saveLiveResults(req) {
  var teacherCodeProp = PropertiesService.getScriptProperties().getProperty('TEACHER_CODE');
  if (!teacherCodeProp || String(req.teacherCode || '').trim() !== String(teacherCodeProp).trim()) {
    return { ok: false, error: 'UNAUTHORIZED', message: 'Sai mã giáo viên.' };
  }
  var records = Array.isArray(req.records) ? req.records : [];
  if (records.length === 0) {
    return { ok: true, savedCount: 0 };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'SERVER_BUSY', message: 'Máy chủ đang bận.' };
  }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var resultSheet = ss.getSheetByName(SHEET_NAMES.RESULTS);
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      resultSheet.appendRow([
        rec.sessionToken || ('LIVE_' + (i + 1)),
        rec.examCode || '',
        rec.startTimeIso || '',
        rec.submitIso || new Date().toISOString(),
        rec.studentName || '',
        rec.className || '',
        rec.score10 || 0,
        rec.rawScoreDisplay || '',
        rec.duplicateFlag || '',
        rec.lateFlag || '',
        rec.summary || 'Thi cùng lúc',
        JSON.stringify(rec.answers || {})
      ]);
    }
    return { ok: true, savedCount: records.length };
  } finally {
    lock.releaseLock();
  }
}

function getExamDataCached(examCode) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'EXAM_' + examCode;
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var examSheet = ss.getSheetByName(SHEET_NAMES.EXAMS);
  var lastRow = examSheet.getLastRow();
  if (lastRow < 2) return null;

  var values = examSheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    if (String(row[0] || '').trim().toUpperCase() === examCode) {
      var openStr = row[4] ? String(row[4]).trim() : '';
      var closeStr = row[5] ? String(row[5]).trim() : '';
      var openMs = openStr ? new Date(openStr).getTime() : null;
      var closeMs = closeStr ? new Date(closeStr).getTime() : null;
      var questions = [];
      try {
        questions = JSON.parse(String(row[9] || '[]'));
      } catch (e) {}

      var examObj = {
        examCode: examCode,
        title: String(row[1] || ''),
        mode: String(row[2] || 'tu_lam'),
        durationMinutes: Number(row[3] || 15),
        openTime: openStr,
        closeTime: closeStr,
        openTimeMs: isNaN(openMs) ? null : openMs,
        closeTimeMs: isNaN(closeMs) ? null : closeMs,
        shuffleQuestions: String(row[6]).toUpperCase() === 'TRUE' || row[6] === true,
        shuffleChoices: String(row[7]).toUpperCase() === 'TRUE' || row[7] === true,
        maxRawScore: Number(row[8] || 0),
        questions: questions
      };
      cache.put(cacheKey, JSON.stringify(examObj), CACHE_TTL_SECONDS);
      return examObj;
    }
  }
  return null;
}

function getAnswerKeyCached(examCode) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'ANS_' + examCode;
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ansSheet = ss.getSheetByName(SHEET_NAMES.ANSWERS);
  var lastRow = ansSheet.getLastRow();
  if (lastRow < 2) return null;

  var values = ansSheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[0] || '').trim().toUpperCase() === examCode) {
      var qId = String(row[1] || '').trim();
      var rawAns = String(row[4] !== undefined ? row[4] : '').trim();
      var parsedAns = null;
      if (rawAns.indexOf('{') === 0 || rawAns.indexOf('[') === 0) {
        try {
          parsedAns = JSON.parse(rawAns);
        } catch (e) {}
      }
      var rawSol = String(row[5] || '');
      var solText = rawSol;
      var hinhLg = [];
      if (rawSol.indexOf('{') === 0) {
        try {
          var parsedSol = JSON.parse(rawSol);
          solText = parsedSol.loigiai || '';
          hinhLg = parsedSol.hinh_lg || [];
        } catch (e) {}
      }
      map[qId] = {
        order: Number(row[2] || (i + 1)),
        type: String(row[3] || 'TN4').toUpperCase(),
        answer: rawAns,
        parsedAnswer: parsedAns,
        solution: solText,
        hinh_lg: hinhLg,
        baseQuestionId: String(row[6] || qId),
        topic: String(row[7] || '')
      };
    }
  }

  cache.put(cacheKey, JSON.stringify(map), CACHE_TTL_SECONDS);
  return map;
}

function generateUniqueExamCode(examSheet) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var existing = {};
  var lastRow = examSheet.getLastRow();
  if (lastRow >= 2) {
    var col = examSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      existing[String(col[i][0] || '').trim().toUpperCase()] = true;
    }
  }
  for (var attempt = 0; attempt < 50; attempt++) {
    var code = '';
    for (var c = 0; c < 4; c++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existing[code]) return code;
  }
  return 'B' + String(Date.now()).slice(-3);
}
