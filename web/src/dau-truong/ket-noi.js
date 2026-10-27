'use strict';
/* ToánKho — Đấu Trường: phần kết nối dùng chung cho màn hình chiếu và điện thoại học sinh.
   Dùng máy chủ MQTT công cộng (giống Đấu Trường cũ). Kênh của mỗi phòng: toankho/dau-truong/v1/<mã phòng>/…

   Máy chiếu phát:  /ctl (giữ lại)   trạng thái phòng, đề câu hiện tại; đáp án chỉ có khi đã công bố
                    /bxh (giữ lại)   danh sách người chơi và điểm
                    /k/<pid>         xác nhận đã nhận câu trả lời
                    /x/<pid> (giữ)   2 phương án bị loại khi học sinh dùng trợ giúp 🎯
   Điện thoại gửi:  /p/<pid> (giữ)   tên người chơi
                    /a/<pid>         câu trả lời (máy chiếu chấm)
                    /h/<pid>         xin trợ giúp 🎯 */

const DT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const dtBase = (room) => 'toankho/dau-truong/v1/' + room;

function dtConnect(room, subs, onMsg, onState) {
  const base = dtBase(room);
  const c = mqtt.connect(DT_BROKER, {
    clientId: 'tk_' + Math.random().toString(16).slice(2, 12),
    clean: true, connectTimeout: 8000, reconnectPeriod: 2000, keepalive: 20,
  });
  c.on('connect', () => { c.subscribe(subs.map((s) => base + s), { qos: 1 }); onState(true); });
  c.on('close', () => onState(false));
  c.on('offline', () => onState(false));
  c.on('message', (topic, payload) => {
    const txt = payload.toString(); if (!txt) return;
    let d; try { d = JSON.parse(txt); } catch { return; }
    onMsg(topic.slice(base.length), d);
  });
  return {
    // Khi đang mất mạng, thư viện tự giữ tin lại và gửi khi kết nối lại.
    pub(sub, obj, retain = false) { c.publish(base + sub, JSON.stringify(obj), { qos: 1, retain }); },
    end() { try { c.end(true); } catch { } },
    get connected() { return c.connected; },
  };
}
