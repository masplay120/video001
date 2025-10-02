FROM jrottenberg/ffmpeg:5.1-ubuntu2204

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
