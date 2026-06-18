const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");

// --- CONFIGURATION ---
// Match the name chosen in loader.cpp
const targetName = "web_backend.exe";
// ---------------------

const express = require("express");
const app = express();
const web_port = process.env.PORT || 3000;

// Create HTTP server
const server = require('http').createServer(app);

// WebSocket server on the same HTTP server
const wss = new WebSocket.Server({
    server: server
});

wss.on("connection", (ws) => {
    console.log("Provider connected");
    ws.on("message", (message) => {
        try {
            // Parse and validate JSON
            const data = JSON.parse(message);
            
            // Log once every 10 messages
            if (!global.msgCounter) global.msgCounter = 0;
            if (global.msgCounter++ % 10 === 0) {
                console.log("Data:", {
                    map: data.map_name,
                    players: data.healths ? data.healths.length : 0,
                    hasCoords: !!(data.x_positions && data.y_positions)
                });
            }
            
            // Broadcast received game data to all connected web clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message); 
                }
            });
        } catch(e) {
            console.error("Invalid JSON received:", e.message);
            console.error("Raw data:", message.toString());
        }
    });
    
    ws.on("close", () => {
        console.log("Provider disconnected");
    });
});

// Serve the radar frontend
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Static assets for maps and images
app.get("/data/images/:imgId", (req, res) => {
    res.sendFile(path.join(__dirname, "data", "images", req.params.imgId));
});

let stored_maps = {};
const base_dir = path.join(__dirname, "data");

/**
 * Parses map metadata from text files in the data directory.
 */
function parseMaps() {
    if (fs.existsSync(base_dir)) {
        const filenames = fs.readdirSync(base_dir);
        for (const filename of filenames) {
            if (!filename.endsWith(".txt")) continue;
            const content = fs.readFileSync(path.join(base_dir, filename), "utf-8");
            
            let read_value = (key) => {
                const start_idx = content.indexOf(key);
                if (start_idx === -1) return 0;
                let numbers = "";
                let found_number = false;
                const subset = content.substr(start_idx);
                for (const c of subset) {
                    if (c.match(/[0-9.-]/)) {
                        if (!found_number) found_number = true;
                        numbers += c;
                    } else if (found_number) return parseFloat(numbers);
                }
                return parseFloat(numbers) || 0;
            }
            
            const pos_x = read_value("pos_x");
            const pos_y = read_value("pos_y");
            const scale = read_value("scale");
            const map_name = filename.split(".")[0];
            stored_maps[map_name] = { pos_x, pos_y, scale };
        }
    }
}

parseMaps();

// API endpoint for map metadata
app.get("/data/:dataId", (req, res) => {
    const map = req.params.dataId;
    if (stored_maps[map])
        res.send(stored_maps[map]);
    else
        res.status(404).send({error: "map not found"});
});

// API endpoint to receive data from Provider via HTTP POST
app.post("/update", express.json(), (req, res) => {
    const data = req.body;
    
    // Broadcast to all WebSocket clients
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
    
    res.json({success: true});
});

server.listen(web_port, () => {
    console.log(`Radar Host listening on port ${web_port}`);
    console.log(`WebSocket server on same port`);
    console.log(`Open http://localhost:${web_port} in your browser`);
});
