const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const { StringDecoder } = require('string_decoder');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
  let conn = null;
  let sshStream = null;
  const decoder = new StringDecoder('utf8');

  console.log('Client connected to WebSocket');

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'connect') {
        if (conn) {
          ws.send(JSON.stringify({ type: 'status', message: 'Already connected', level: 'warning' }));
          return;
        }

        ws.send(JSON.stringify({ type: 'status', message: 'กำลังเชื่อมต่อ SSH...', level: 'info' }));

        conn = new Client();

        conn.on('ready', () => {
          ws.send(JSON.stringify({ type: 'status', message: 'เชื่อมต่อสำเร็จ! กำลังสร้าง Shell...', level: 'info' }));

          const cols = msg.cols || 80;
          const rows = msg.rows || 24;

          conn.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'error', message: `ไม่สามารถเปิด Shell: ${err.message}` }));
              conn.end();
              conn = null;
              return;
            }

            sshStream = stream;

            // Notify client that connection is fully established
            ws.send(JSON.stringify({ type: 'status', message: 'เชื่อมต่อเสร็จสมบูรณ์', level: 'success' }));

            // Listen for data from SSH stream and forward to client
            sshStream.on('data', (data) => {
              ws.send(JSON.stringify({ type: 'data', data: decoder.write(data) }));
            });

            sshStream.on('close', () => {
              ws.send(JSON.stringify({ type: 'status', message: 'เซสชัน Shell ถูกปิดลง', level: 'info' }));
              ws.close();
            });
          });
        });

        conn.on('error', (err) => {
          console.error('SSH Client Error:', err);
          ws.send(JSON.stringify({ type: 'error', message: `ข้อผิดพลาด SSH: ${err.message}` }));
        });

        conn.on('close', () => {
          ws.send(JSON.stringify({ type: 'status', message: 'การเชื่อมต่อ SSH ถูกปิด', level: 'info' }));
          conn = null;
          sshStream = null;
        });

        // Attempt SSH connection
        conn.connect({
          host: msg.host,
          port: parseInt(msg.port) || 22,
          username: msg.username,
          password: msg.password,
          // Optional: You can add private key support here if requested in the future,
          // but for now, simple password credentials are requested.
          keepaliveInterval: 10000,
          keepaliveCountMax: 3
        });

      } else if (msg.type === 'input') {
        if (sshStream) {
          sshStream.write(msg.data);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'กรุณาเชื่อมต่อ SSH ก่อนส่งคำสั่ง' }));
        }

      } else if (msg.type === 'resize') {
        if (sshStream) {
          sshStream.setWindow(msg.rows, msg.cols, 0, 0);
        }
      }

    } catch (e) {
      console.error('Error handling WebSocket message:', e);
      ws.send(JSON.stringify({ type: 'error', message: 'ข้อมูลร้องขอไม่ถูกต้อง' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
    if (sshStream) {
      sshStream.end();
    }
    if (conn) {
      conn.end();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Web SSH Client server is running on http://localhost:${PORT}`);
});
