import express from "express";
import fetch from "node-fetch";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 8080;

// Directorios
const VIDEOS_DIR = "/app/videos";
const HLS_DIR = "/app/hls";
if(!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
if(!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });

// URL de tu hosting
const JSON_URL = "https://radio.x10.mx/video/lista.json";
const UPLOADS_URL = "https://radio.x10.mx/video/uploads/";

// Leer lista y procesar nuevos videos
async function processVideos() {
    try {
        const res = await fetch(JSON_URL);
        const videos = await res.json();

        for(const v of videos){
            const mp4Path = path.join(VIDEOS_DIR, v);
            const hlsPath = path.join(HLS_DIR, v.replace(".mp4",""));
            if(!fs.existsSync(hlsPath)) fs.mkdirSync(hlsPath, { recursive: true });

            // Si ya existe HLS, saltar
            if(fs.existsSync(path.join(hlsPath,"playlist.m3u8"))) continue;

            // Descargar MP4
            console.log(`Descargando ${v}...`);
            const videoRes = await fetch(UPLOADS_URL + v);
            const fileStream = fs.createWriteStream(mp4Path);
            await new Promise((resolve, reject) => {
                videoRes.body.pipe(fileStream);
                videoRes.body.on("error", reject);
                fileStream.on("finish", resolve);
            });

            // Convertir a HLS
            console.log(`Convirtiendo ${v} a HLS...`);
            const cmd = `ffmpeg -i ${mp4Path} -codec: copy -start_number 0 -hls_time 5 -hls_list_size 0 -hls_flags delete_segments+program_date_time -f hls ${hlsPath}/playlist.m3u8`;
            await new Promise((resolve, reject) => {
                exec(cmd, (err, stdout, stderr) => {
                    if(err) reject(stderr);
                    else resolve(stdout);
                });
            });
        }

        // Generar master.m3u8 para loop infinito
        let master = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ALLOW-CACHE:YES\n#EXT-X-TARGETDURATION:5\n";
        for(const v of videos){
            const name = v.replace(".mp4","");
            master += `#EXTINF:5.0,\n${name}/playlist.m3u8\n`;
        }
        fs.writeFileSync(path.join(HLS_DIR,"master.m3u8"), master);
        console.log("Master playlist actualizada.");

    } catch(err){
        console.error("Error al procesar videos:", err);
    }
}

// Procesar videos al iniciar y luego cada 1 minuto
processVideos();
setInterval(processVideos, 60000);

// Servir HLS
app.use("/hls", express.static(HLS_DIR));

app.listen(PORT, () => console.log(`Fly.io HLS server running on port ${PORT}`));
