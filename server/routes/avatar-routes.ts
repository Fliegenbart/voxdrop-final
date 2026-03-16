import { Router, Request, Response } from "express";
import { Readable } from "stream";

const router = Router();
const AVATAR_SERVICE_URL = (process.env.AVATAR_SERVICE_URL || "http://avatar-service:8005").replace(/\/$/, "");
const AVATAR_API_BASE = `${AVATAR_SERVICE_URL}/api`;

const handleProxyError = (res: Response, error: unknown) => {
  console.error("[Avatar] Service proxy error:", error);
  return res.status(503).json({ error: "Avatar service unavailable" });
};

router.get("/health", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${AVATAR_API_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return res.status(503).json({ status: "unhealthy" });
    }
    const data = await response.json().catch(() => ({ status: "healthy" }));
    return res.json(data);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.get("/avatars", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${AVATAR_API_BASE}/avatars`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (Array.isArray(data?.avatars)) {
      data.avatars = data.avatars.map((avatar: { id?: string }) => ({
        ...avatar,
        preview_url: `/api/avatar/preview/${avatar.id ?? ""}`,
      }));
    }

    return res.json(data);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.get("/voices", async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${AVATAR_API_BASE}/voices`, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.json(data);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.post("/generate", async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${AVATAR_API_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (data?.video_url && data?.job_id) {
      data.video_url = `/api/avatar/video/${data.job_id}`;
    }

    return res.json(data);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.post("/upload", async (req: Request, res: Response) => {
  try {
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Invalid upload request" });
    }

    const response = await fetch(`${AVATAR_API_BASE}/avatar-upload`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body: req as any,
      // Required for streaming body in Node fetch
      duplex: "half",
      signal: AbortSignal.timeout(60000),
    } as any);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (data?.id) {
      data.preview_url = `/api/avatar/preview/${data.id}`;
    }

    return res.json(data);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.get("/status/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const safeJobId = encodeURIComponent(jobId);
    const response = await fetch(`${AVATAR_API_BASE}/status/${safeJobId}`, {
      signal: AbortSignal.timeout(8000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (data?.video_url) {
      data.video_url = `/api/avatar/video/${jobId}`;
    }

    return res.json(data);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.get("/preview/:avatarId", async (req: Request, res: Response) => {
  try {
    const { avatarId } = req.params;
    const safeAvatarId = encodeURIComponent(avatarId);
    const response = await fetch(`${AVATAR_API_BASE}/avatar-preview/${safeAvatarId}`);

    if (!response.ok) {
      return res.status(response.status).send("Avatar preview not found");
    }

    res.status(response.status);

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    const webStream = response.body;
    if (!webStream) {
      return res.status(500).json({ error: "No response body" });
    }

    Readable.fromWeb(webStream as any).pipe(res);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

router.get("/video/:jobId", async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const safeJobId = encodeURIComponent(jobId);
    const headers: Record<string, string> = {};
    if (typeof req.headers.range === "string") {
      headers.Range = req.headers.range;
    }

    const response = await fetch(`${AVATAR_API_BASE}/video/${safeJobId}`, {
      headers,
    });

    if (!response.ok) {
      return res.status(response.status).send("Video not found");
    }

    res.status(response.status);

    const contentType = response.headers.get("content-type");
    if (contentType) res.setHeader("Content-Type", contentType);

    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);

    const contentRange = response.headers.get("content-range");
    if (contentRange) res.setHeader("Content-Range", contentRange);

    const acceptRanges = response.headers.get("accept-ranges");
    if (acceptRanges) res.setHeader("Accept-Ranges", acceptRanges);

    const contentLength = response.headers.get("content-length");
    if (contentLength) res.setHeader("Content-Length", contentLength);

    const webStream = response.body;
    if (!webStream) {
      return res.status(500).json({ error: "No response body" });
    }

    Readable.fromWeb(webStream as any).pipe(res);
  } catch (error) {
    return handleProxyError(res, error);
  }
});

export default router;
