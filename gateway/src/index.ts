import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// 👇 ЛОГ ВСЕХ ВХОДЯЩИХ ЗАПРОСОВ
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url} body=`, req.body);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "gateway" }));
app.get("/ping",   (_req, res) => res.json({ pong: true })); // тестовый GET

const WORKERS = {
  "color-cluster": process.env.WORKER_CLUSTER_URL || "http://localhost:8082",
  "cell-mapper":   process.env.WORKER_CELLS_URL   || "http://localhost:8083",
};

app.post("/api/jobs/cluster", async (req, res) => {
  try {
    const r = await axios.post(`${WORKERS["color-cluster"]}/run`, req.body, { timeout: 5000 });
    res.json(r.data);
  } catch (e: any) {
    console.error("cluster error:", e.message);
    res.status(502).json({ ok: false, error: "cluster_worker_unreachable" });
  }
});

app.post("/api/jobs/cells", async (req, res) => {
  try {
    const r = await axios.post(`${WORKERS["cell-mapper"]}/run`, req.body, { timeout: 5000 });
    res.json(r.data);
  } catch (e: any) {
    console.error("cells error:", e.message);
    res.status(502).json({ ok: false, error: "cell_mapper_worker_unreachable" });
  }
});

app.listen(9080, () => console.log("gateway:9080"));
