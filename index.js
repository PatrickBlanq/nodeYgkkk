import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 8080;

app.get("/", async (req, res) => {
    try {
        const r = await fetch("https://你的目标地址");
        const text = await r.text();
        res.send("<pre>" + text + "</pre>");
    } catch (e) {
        res.send("错误：" + e.toString());
    }
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
