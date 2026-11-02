import { defineConfig } from 'vite';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLATE_RE = /^[\u4e00-\u9fa5][A-Z][A-Z0-9]{5}$/;
let busy = false;

export default defineConfig({
  // 相对基路径：本地 dev 与 GitHub Pages 项目子路径共用同一份产物
  base: './',
  plugins: [
    {
      name: 'plate-editor',
      configureServer(server) {
        server.middlewares.use('/api/plate-number', (req, res) => {
          const json = (code, obj) => {
            res.statusCode = code;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(obj));
          };
          if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            let text = '';
            try {
              text = String(JSON.parse(body).text || '').trim().toUpperCase();
            } catch {
              /* fall through to validation */
            }
            if (!PLATE_RE.test(text)) {
              return json(400, { error: '格式：1 个汉字 + 1 个字母 + 5 位字母或数字，共 7 位（如 蒙AZ8M68）' });
            }
            if (busy) return json(409, { error: '正在生成，请稍候' });

            busy = true;
            const py = spawn('python', ['make_plate.py', text], {
              cwd: path.join(__dirname, '.tmp'),
            });
            let err = '';
            py.stderr.on('data', (c) => (err += c));
            py.on('close', (code) => {
              busy = false;
              if (code !== 0) {
                return json(500, { error: '生成失败：' + err.slice(-300) });
              }
              try {
                const out = path.join(__dirname, '.tmp', 'zd', 'out');
                const pub = path.join(__dirname, 'public', 'textures');
                mkdirSync(pub, { recursive: true });
                copyFileSync(path.join(out, 'cn_plate_face.png'), path.join(pub, 'cn_plate_face.png'));
                copyFileSync(path.join(out, 'cn_plate_normal.png'), path.join(pub, 'cn_plate_normal.png'));
              } catch (e) {
                return json(500, { error: '写入贴图失败：' + e.message });
              }
              json(200, { ok: true, ts: Date.now(), text });
            });
          });
        });
      },
    },
  ],
});
