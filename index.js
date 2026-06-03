import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", async (req, res) => {
    try {

        const text = "await r.text()";
        res.send("<pre>" + text + "</pre>");
    } catch (e) {
        res.send("错误：" + e.toString());
    }
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
