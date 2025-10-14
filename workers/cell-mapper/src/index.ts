import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, service: "cell-mapper" }));

app.post("/run", (_req, res) => {
  // заглушка
  res.json({ ok: true, cells: 12345, dxf: "M0,0 L10,0 ..." });
});

app.listen(8083, () => console.log("cell-mapper:8083"));
