import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "color-cluster" }));

app.post("/run", (req, res) => {
  // заглушка
  res.json({ ok: true, palette: ["#a00", "#0aa"], stats: { k: 16 } });
});

app.listen(8082, () => console.log("color-cluster:8082"));
