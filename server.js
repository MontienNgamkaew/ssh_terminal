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

        conn.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
          const responses = prompts.map(() => msg.password);
          finish(responses);
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
          tryKeyboard: true,
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

      } else if (msg.type === 'sftp_ls') {
        if (!conn) { ws.send(JSON.stringify({ type: 'sftp_error', message: 'ไม่ได้เชื่อมต่อ SSH' })); return; }
        conn.sftp((err, sftp) => {
          if (err) { ws.send(JSON.stringify({ type: 'sftp_error', message: err.message })); return; }
          const targetPath = msg.path || '/';
          sftp.readdir(targetPath, (err2, list) => {
            sftp.end();
            if (err2) { ws.send(JSON.stringify({ type: 'sftp_error', message: err2.message })); return; }
            const files = list.map(f => ({
              name: f.filename,
              size: f.attrs.size,
              isDir: !!(f.attrs.mode & 0o40000),
              mtime: f.attrs.mtime
            })).sort((a, b) => {
              if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
            ws.send(JSON.stringify({ type: 'sftp_ls', path: targetPath, files }));
          });
        });

      } else if (msg.type === 'sftp_get') {
        if (!conn) return;
        conn.sftp((err, sftp) => {
          if (err) { ws.send(JSON.stringify({ type: 'sftp_error', message: err.message })); return; }
          const chunks = [];
          let totalSize = 0;
          const MAX_SIZE = 50 * 1024 * 1024;
          const stream = sftp.createReadStream(msg.path);
          stream.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > MAX_SIZE) {
              stream.destroy();
              sftp.end();
              ws.send(JSON.stringify({ type: 'sftp_error', message: 'ไฟล์ใหญ่เกินไป (จำกัด 50MB)' }));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('end', () => {
            sftp.end();
            ws.send(JSON.stringify({
              type: 'sftp_get',
              path: msg.path,
              name: path.basename(msg.path),
              data: Buffer.concat(chunks).toString('base64')
            }));
          });
          stream.on('error', err2 => {
            sftp.end();
            ws.send(JSON.stringify({ type: 'sftp_error', message: err2.message }));
          });
        });

      } else if (msg.type === 'sftp_put') {
        if (!conn) return;
        conn.sftp((err, sftp) => {
          if (err) { ws.send(JSON.stringify({ type: 'sftp_error', message: err.message })); return; }
          const remotePath = (msg.remotePath || '/').replace(/\/+$/, '') + '/' + msg.name;
          const buf = Buffer.from(msg.data, 'base64');
          const writeStream = sftp.createWriteStream(remotePath);
          writeStream.on('close', () => {
            sftp.end();
            ws.send(JSON.stringify({ type: 'sftp_put', name: msg.name, success: true }));
          });
          writeStream.on('error', err2 => {
            sftp.end();
            ws.send(JSON.stringify({ type: 'sftp_error', message: err2.message }));
          });
          writeStream.write(buf);
          writeStream.end();
        });
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
