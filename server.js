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

// URLs hosting
const JSON_URL = "https://radio.x10.mx/video/lista.json";
const UPLOADS_URL = "https://radio.x10.mx/video/uploads/";

// CORS para que VLC y navegadores puedan leer
app.use((req,res,next)=>{
    res.setHeader("Access-Control-Allow-Origin","*");
    next();
});

// Función para convertir MP4 a HLS
async function convertToHLS(mp4Path, hlsPath){
    return new Promise((resolve, reject)=>{
        const cmd = `ffmpeg -i "${mp4Path}" -codec: copy -start_number 0 -hls_time 5 -hls_list_size 0 -hls_flags delete_segments+program_date_time -f hls "${hlsPath}/playlist.m3u8"`;
        exec(cmd, (err, stdout, stderr)=>{
            if(err) reject(stderr);
            else resolve(stdout);
        });
    });
}

// Procesar lista de videos
async function processVideos(){
    try {
        const res = await fetch(JSON_URL);
        const videos = await res.json();

        for(const v of videos){
            const mp4Path = path.join(VIDEOS_DIR, v);
            const hlsPath = path.join(HLS_DIR, v.replace(".mp4",""));
            if(!fs.existsSync(hlsPath)) fs.mkdirSync(hlsPath, { recursive: true });

            // Si ya existe HLS, saltar
            if(fs.existsSync(path.join(hlsPath,"playlist.m3u8"))) continue;

            // Descargar MP4 si no existe
            if(!fs.existsSync(mp4Path)){
                try{
                    console.log(`Descargando ${v}...`);
                    const videoRes = await fetch(UPLOADS_URL + v);
                    const fileStream = fs.createWriteStream(mp4Path);
                    await new Promise((resolve, reject)=>{
                        videoRes.body.pipe(fileStream);
                        videoRes.body.on("error", reject);
                        fileStream.on("finish", resolve);
                    });
                } catch(err){
                    console.error(`Error descargando ${v}:`, err);
                    continue; // pasa al siguiente video
                }
            }

            // Convertir a HLS
            try{
                console.log(`Convirtiendo ${v} a HLS...`);
                await convertToHLS(mp4Path, hlsPath);
            } catch(err){
                console.error(`Error convirtiendo ${v}:`, err);
                continue;
            }
        }

        // Generar master.m3u8 con loop infinito
        let master = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-ALLOW-CACHE:YES\n#EXT-X-TARGETDURATION:5\n";
        for(const v of videos){
            const name = v.replace(".mp4","");
            if(fs.existsSync(path.join(HLS_DIR,name,"playlist.m3u8"))){
                master += `#EXTINF:5.0,\n${name}/playlist.m3u8\n`;
            }
        }
        fs.writeFileSync(path.join(HLS_DIR,"master.m3u8"), master);
        console.log("Master playlist actualizada.");

    } catch(err){
        console.error("Error procesando videos:", err);
    }
}

// Procesar al iniciar y luego cada 1 minuto
processVideos();
setInterval(processVideos, 60000);

// Servir HLS
app.use("/hls", express.static(HLS_DIR));

app.listen(PORT, ()=>console.log(`Fly.io HLS server corriendo en puerto ${PORT}`));
