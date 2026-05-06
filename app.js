const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execSync } = require('child_process');
function ensureModule(name) {
    try {
        require.resolve(name);
    } catch (e) {
        console.log(`Module '${name}' not found. Installing...`);
        execSync(`npm install ${name}`, { stdio: 'inherit' });
    }
}
ensureModule('ws');
const { WebSocket, createWebSocketStream } = require('ws');
const NAME = process.env.NAME || os.hostname();


const axios = require('axios');
const FILE_PATH = path.resolve(__dirname, 'tmp');
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

// 配置
const UUID = process.env.UUID || '792c9cd6-9ece-4ebc-ff02-86eaf8bf7e73';
const ARGO_PORT = 28080;
const ARGO_LOG = path.join(FILE_PATH, 'argo.log');
const SINGBOX_CONF = path.join(FILE_PATH, 'config.json');

// 官方下载链接（Linux amd64）
const SINGBOX_URL = 'https://github.com/SagerNet/sing-box/releases/download/v1.12.9/sing-box-1.12.9-linux-amd64.tar.gz';
const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';

// 下载文件
async function downloadTo(url, outPath) {
    if (fs.existsSync(outPath)) return console.log('已存在:', outPath);
    console.log('下载:', url);
    const writer = fs.createWriteStream(outPath);
    const res = await axios({ url, method: 'GET', responseType: 'stream', timeout: 120000 });
    res.data.pipe(writer);
    await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
    fs.chmodSync(outPath, 0o755);
    console.log('保存到', outPath);
}

// 解压 sing-box tar.gz 并移动到 tmp/sing-box
function extractSingBoxGZ(tarPath, dest) {
    execSync(`tar -xzf "${tarPath}" -C "${dest}"`);
    console.log('解压完成', tarPath);

    // 移动 sing-box 到 tmp/sing-box
    const extractedDir = fs.readdirSync(dest).find(d => d.startsWith('sing-box-'));
    const oldBin = path.join(dest, extractedDir, 'sing-box');
    console.log('sing-box在目录：', oldBin);
    const newBin = path.join(dest, 'sing-box');
    //fs.renameSync(oldBin, newBin);
    fs.chmodSync(oldBin, 0o755);
    console.log('sing-box 移动到', oldBin);
    return oldBin;
}

// 写 sing-box 配置
function writeSingBoxConfig() {
    const cfg = {
        log: { level: 'error' },
        inbounds: [{
            type: 'vless',
            listen: '::',
            listen_port: ARGO_PORT,
            users: [{ uuid: UUID }],
            transport: { type: 'ws', path: `/${UUID}`, max_early_data: 2048 }
        }],
        outbounds: [{ type: 'direct' }]
    };
    fs.writeFileSync(SINGBOX_CONF, JSON.stringify(cfg, null, 2));
    console.log('已生成配置:', SINGBOX_CONF);
}

// 启动 sing-box
function startSingBox(binPath) {
    console.log('启动 sing-box...');
    const cp = spawn(binPath, ['run', '-c', SINGBOX_CONF], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
    cp.unref();
}

// 启动 cloudflared
function startCloudflared1(binPath) {
    console.log('启动 cloudflared...');
    const out = fs.openSync(ARGO_LOG, 'a');
    const cp = spawn(binPath, ['tunnel', '--url', `http://localhost:${ARGO_PORT}`, '--loglevel', 'info'], { detached: true, stdio: ['ignore', out, out] });
    cp.unref();
}

function startCloudflared(binPath, token) {
    console.log('启动 cloudflared 固定隧道...');

    const out = fs.openSync(ARGO_LOG, 'a');

    const cp = spawn(
        binPath,
        [
            "tunnel",
            "--no-autoupdate",
            "run",
            "--token",
            token
        ],
        {
            detached: true,
            stdio: ["ignore", out, out]
        }
    );

    cp.unref();
}

// 轮询 argo.log 获取 trycloudflare 域名
function pollArgoDomain(retries = 20, intervalMs = 2000) {
    return new Promise((resolve) => {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (fs.existsSync(ARGO_LOG)) {
                const txt = fs.readFileSync(ARGO_LOG, 'utf8');
                const m = txt.match(/https?:\/\/([a-z0-9-]+\.trycloudflare\.com)/i);
                if (m) { clearInterval(timer); return resolve(m[1]); }
            }
            if (attempts >= retries) { clearInterval(timer); return resolve(null); }
        }, intervalMs);
    });
}



console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
console.log("当前版本：25.6.9");
console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
async function getVariableValue(variableName, defaultValue) {
    const envValue = process.env[variableName];
    if (envValue) {
        return envValue;
    }
    if (defaultValue) {
        return defaultValue;
    }
    let input = '';
    while (!input) {
        input = await ask(`请输入${variableName}: `);
        if (!input) {
            console.log(`${variableName}不能为空，请重新输入!`);
        }
    }
    return input;
}
function ask(question) {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}
async function main() {
    const UUID = await getVariableValue('UUID', '792c9cd6-9ece-4ebc-ff02-86eaf8bf7e73'); // 为保证安全隐蔽，建议留空，可在Node.js界面下的环境变量添加处（Environment variables）,点击ADD VARIABLE，修改变量
    console.log('你的UUID:', UUID);

    const PORT = await getVariableValue('PORT', '53332');// 为保证安全隐蔽，建议留空，可在Node.js界面下的环境变量添加处（Environment variables）,点击ADD VARIABLE，修改变量
    console.log('你的端口:', PORT);

    const DOMAIN = await getVariableValue('DOMAIN', 'in.5i7.dpdns.org');// 为保证安全隐蔽，建议留空，可在Node.js界面下的环境变量添加处（Environment variables）,点击ADD VARIABLE，修改变量
    console.log('你的域名:', DOMAIN);

    const httpServer = http.createServer((req, res) => {
        if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Hello, World-YGkkk\n');
        } else if (req.url === `/${UUID}`) {
            let vlessURL;
            if (NAME.includes('server') || NAME.includes('hostypanel')) {
                vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#Vl-ws-tls-${NAME}`;
            } else {
                vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#Vl-ws-tls-${NAME}`;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(vlessURL + '\n');
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found\n');
        }
    });

    httpServer.listen(PORT, () => {
        console.log(`HTTP Server is running on port ${PORT}`);
    });

    const wss = new WebSocket.Server({ server: httpServer });
    const uuid = UUID.replace(/-/g, "");
    wss.on('connection', ws => {
        ws.once('message', msg => {
            const [VERSION] = msg;
            const id = msg.slice(1, 17);
            if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
            let i = msg.slice(17, 18).readUInt8() + 19;
            const port = msg.slice(i, i += 2).readUInt16BE(0);
            const ATYP = msg.slice(i, i += 1).readUInt8();
            const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
                (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
                    (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));
            ws.send(new Uint8Array([VERSION, 0]));
            const duplex = createWebSocketStream(ws);
            net.connect({ host, port }, function () {
                this.write(msg.slice(i));
                duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
            }).on('error', () => { });
        }).on('error', () => { });
    });
    console.log(`vless-ws-tls节点分享: vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#Vl-ws-tls-${NAME}`);


    try {
        const singboxTar = path.join(FILE_PATH, 'sing-box.tar.gz');
        const cfBin = path.join(FILE_PATH, 'cloudflared');

        await downloadTo(CLOUDFLARED_URL, cfBin);
        await downloadTo(SINGBOX_URL, singboxTar);

        const singboxBinPath = extractSingBoxGZ(singboxTar, FILE_PATH);
        const token = 'eyJhIjoiODdiZmI2YjUxMjVmM2UxMDExYTQ5YTY1MWYyMTUwMTkiLCJ0IjoiOTYyMjZmNjktYjIwNy00MWZiLTllYzUtYzkxNTI1MzYyOWQ1IiwicyI6Ik1UZ3lNekkwWkdJdFlqVTVZaTAwT0RaakxXSXdOV0V0TW1FME9UTXlNMll5T1dVMyJ9'
        writeSingBoxConfig();
        startSingBox(singboxBinPath);
        startCloudflared(cfBin, token);

        console.log('🚀 等待 Argo 输出域名...');
        const domain = await pollArgoDomain(20, 2000);
        if (domain) {
            const link = `vless://${UUID}@${domain}:443?encryption=none&security=tls&type=ws&host=${domain}&path=%2F${UUID}#Argo-VLESS`;
            console.log('✅ 找到域名:', domain);
            console.log('✅ VLESS 链接:\n', link);
        } else {
            console.log('⚠️ 未找到 trycloudflare 域名，请检查', ARGO_LOG);
        }

    } catch (err) {
        console.error('错误:', err);
    }
}
main();
