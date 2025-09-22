import React, { useEffect, useRef, useState } from "react";

/**
 * Live2DContainer
 *
 * Example usage:
 * <Live2DContainer
 *   modelUrl="/models/Hiyori/Hiyori.model3.json"
 *   width={480}
 *   height={480}
 *   eyeStrength={1.0}
 *   coreScriptUrl="/live2d/live2dcubismcore.min.js"
 * />
 *
 * Notes:
 * - Hosts a PixiJS Application inside a div and renders a Live2D model.
 * - Pointer movement steers the model eye/head angles; the model is draggable.
 * - The component loads live2dcubismcore.min.js (local first, then CDN fallback).
 */
const DEFAULT_CORE_SCRIPT_URL = "/live2d/live2dcubismcore.min.js";
const CUBISM_CORE_CDN_URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";

let cubismCorePromise;

function loadCubismCoreScript(url) {
  return new Promise((resolve, reject) => {
    const normalizedUrl = url?.trim();
    if (!normalizedUrl) {
      reject(new Error("Live2D Cubism core script URL is not provided."));
      return;
    }

    if (typeof document === "undefined") {
      resolve();
      return;
    }

    const existingScript =
      document.querySelector(`script[data-live2d-core="true"][src="${normalizedUrl}"]`) ??
      document.querySelector(`script[src="${normalizedUrl}"]`);

    const errorMessage = `Failed to load Live2D Cubism core script from "${normalizedUrl}".`;

    if (existingScript) {
      if (existingScript.getAttribute("data-live2d-core-loaded") === "true" || window.Live2DCubismCore) {
        resolve();
        return;
      }

      const onLoad = () => {
        existingScript.setAttribute("data-live2d-core-loaded", "true");
        resolve();
      };

      const onError = () => {
        existingScript.removeEventListener("load", onLoad);
        existingScript.removeEventListener("error", onError);
        reject(new Error(errorMessage));
      };

      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = normalizedUrl;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.live2dCore = "true";

    const onLoad = () => {
      script.setAttribute("data-live2d-core-loaded", "true");
      resolve();
    };

    const onError = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      script.remove();
      reject(new Error(errorMessage));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });
}

async function ensureCubismCore(scriptUrl = DEFAULT_CORE_SCRIPT_URL) {
  if (typeof window === "undefined") {
    return;
  }

  if (window.Live2DCubismCore) {
    return;
  }

  if (cubismCorePromise) {
    return cubismCorePromise;
  }

  cubismCorePromise = loadCubismCoreScript(scriptUrl)
    .then(() => {
      if (!window.Live2DCubismCore) {
        throw new Error("Live2DCubismCore global is still missing after loading the script.");
      }
    })
    .catch((error) => {
      cubismCorePromise = undefined;
      throw error;
    });

  return cubismCorePromise;
}

function resolveBackgroundColor(PIXI, background) {
  if (background === "transparent" || background == null) {
    return 0x000000;
  }

  if (typeof background === "number") {
    return background;
  }

  if (typeof background === "string") {
    try {
      if (background.startsWith("0x") || background.startsWith("0X")) {
        return parseInt(background.slice(2), 16);
      }
      if (background.startsWith("#")) {
        const converter = PIXI.utils?.string2hex;
        if (converter) {
          return converter(background);
        }
        return parseInt(background.slice(1), 16);
      }
    } catch {
      // fall back to default color
    }
  }

  return 0x000000;
}

export default function Live2DContainer({
  modelUrl,
  width = 480,
  height = 480,
  eyeStrength = 1.0,
  background = "transparent",
  className = "",
  coreScriptUrl = DEFAULT_CORE_SCRIPT_URL,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const rafRef = useRef(null);
  const draggingRef = useRef({ dragging: false, offset: { x: 0, y: 0 } });
  const pointerInsideRef = useRef(false);

  const [status, setStatus] = useState("init");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let dispose = null;

    async function boot() {
      const host = hostRef.current;
      const canvas = canvasRef.current;
      if (!host || !canvas) {
        return;
      }

      setStatus("loading");
      setError(null);

      try {
        try {
          await ensureCubismCore(coreScriptUrl);
        } catch (coreError) {
          if (coreScriptUrl !== CUBISM_CORE_CDN_URL) {
            console.warn("[Live2DContainer] Failed to load local Cubism core, falling back to CDN.", coreError);
            await ensureCubismCore(CUBISM_CORE_CDN_URL);
          } else {
            throw coreError;
          }
        }

        if (cancelled || !hostRef.current || !canvasRef.current) {
          return;
        }

        const PIXIImporter = await import("pixi.js");
        const PIXI = PIXIImporter.default ?? PIXIImporter;
        const { Live2DModel } = await import("pixi-live2d-display/cubism4");

        if (cancelled || !hostRef.current || !canvasRef.current) {
          return;
        }

        const isTransparent = background === "transparent";
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        canvas.style.borderRadius = "1rem";

        const app = new PIXI.Application({
          view: canvas,
          width,
          height,
          backgroundAlpha: isTransparent ? 0 : 1,
          backgroundColor: isTransparent ? undefined : resolveBackgroundColor(PIXI, background),
          antialias: true,
          powerPreference: "high-performance",
        });

        if (cancelled || !hostRef.current || !canvasRef.current) {
          app.destroy(false);
          return;
        }

        appRef.current = app;

        let model = null;
        let pointerMoveHandler = null;
        let pointerLeaveHandler = null;
        let pointerEnterHandler = null;
        let idleTicker = null;
        let idleClock = 0;

        if (modelUrl) {
          model = await Live2DModel.from(modelUrl, { autoInteract: false });

          if (cancelled) {
            model?.destroy?.(true);
            app.destroy(false);
            return;
          }

          modelRef.current = model;

          const scale = Math.min(width / (model.width * 0.8), height / (model.height * 0.8));
          model.scale.set(scale);
          model.position.set(width / 2, height * 0.95);
          model.anchor.set(0.5, 1.0);

          model.interactive = true;
          model.cursor = "grab";

          model.on("pointerdown", (event) => {
            const pos = event.data.getLocalPosition(model.parent);
            draggingRef.current.dragging = true;
            draggingRef.current.offset = { x: model.x - pos.x, y: model.y - pos.y };
            model.cursor = "grabbing";
          });
          model.on("pointerup", () => {
            draggingRef.current.dragging = false;
            model.cursor = "grab";
          });
          model.on("pointerupoutside", () => {
            draggingRef.current.dragging = false;
            model.cursor = "grab";
          });
          model.on("pointermove", (event) => {
            if (!draggingRef.current.dragging) return;
            const pos = event.data.getLocalPosition(model.parent);
            model.position.set(pos.x + draggingRef.current.offset.x, pos.y + draggingRef.current.offset.y);
          });

          pointerMoveHandler = (evt) => {
            pointerInsideRef.current = true;
            if (!model.internalModel) return;
            const rect = host.getBoundingClientRect();
            const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
            const y = ((evt.clientY - rect.top) / rect.height) * 2 - 1;

            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
            }

            rafRef.current = requestAnimationFrame(() => {
              if (!model.internalModel) return;
              const core = model.internalModel.coreModel;

              const eyeX = clamp(x * 1.0 * eyeStrength, -1, 1);
              const eyeY = clamp(y * -1.0 * eyeStrength, -1, 1);
              setParam(core, "ParamEyeBallX", eyeX, 0.3);
              setParam(core, "ParamEyeBallY", eyeY, 0.3);

              const headX = clamp(x * 20 * eyeStrength, -30, 30);
              const headY = clamp(y * -15 * eyeStrength, -30, 30);
              setParam(core, "ParamAngleX", headX, 0.2);
              setParam(core, "ParamAngleY", headY, 0.2);
              setParam(core, "ParamBodyAngleX", headX * 0.1, 0.15);
            });
          };

          pointerLeaveHandler = () => {
            pointerInsideRef.current = false;
            if (!model.internalModel) return;
            const core = model.internalModel.coreModel;
            smoothBackTo(core, [
              ["ParamEyeBallX", 0],
              ["ParamEyeBallY", 0],
              ["ParamAngleX", 0],
              ["ParamAngleY", 0],
              ["ParamBodyAngleX", 0],
            ]);
          };

          pointerEnterHandler = () => {
            pointerInsideRef.current = true;
          };

          host.addEventListener("pointermove", pointerMoveHandler);
          host.addEventListener("pointerleave", pointerLeaveHandler);
          host.addEventListener("pointerenter", pointerEnterHandler);

          app.stage.addChild(model);
          app.renderer.resize(width, height);

          idleTicker = () => {
            if (!model.internalModel) {
              return;
            }

            model.update(app.ticker.deltaMS);

            if (pointerInsideRef.current || draggingRef.current.dragging) {
              return;
            }

            idleClock += app.ticker.deltaMS / 1000;
            const core = model.internalModel.coreModel;

            const sway = Math.sin(idleClock * 1.2);
            const nod = Math.sin(idleClock * 0.8);
            const blink = Math.sin(idleClock * 0.4);

            setParam(core, "ParamAngleX", sway * 12, 0.08);
            setParam(core, "ParamAngleY", nod * 6, 0.08);
            setParam(core, "ParamBodyAngleX", sway * 4, 0.05);
            setParam(core, "ParamBreath", (blink + 1) * 0.25, 0.04);
          };

          app.ticker.add(idleTicker);

          if (!cancelled) {
            setStatus("ready");
          }
        } else if (!cancelled) {
          setStatus("idle");
        }

        const cleanup = () => {
          try {
            if (pointerMoveHandler) {
              host.removeEventListener("pointermove", pointerMoveHandler);
            }
            if (pointerLeaveHandler) {
              host.removeEventListener("pointerleave", pointerLeaveHandler);
            }
            if (pointerEnterHandler) {
              host.removeEventListener("pointerenter", pointerEnterHandler);
            }
            if (rafRef.current) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            if (idleTicker) {
              app.ticker.remove(idleTicker);
            }
            draggingRef.current = { dragging: false, offset: { x: 0, y: 0 } };
            pointerInsideRef.current = false;

            if (model) {
              model.cursor = "default";
              if (model.parent) {
                model.parent.removeChild(model);
              }
              model.destroy?.(true);
            }

            app.destroy(false);
          } catch (cleanupError) {
            console.error(cleanupError);
          } finally {
            appRef.current = null;
            modelRef.current = null;
          }
        };

        return cleanup;
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err?.message || String(err));
          setStatus("error");
        }
      }
    }

    boot().then((fn) => {
      if (typeof fn === "function") {
        if (cancelled) {
          fn();
        } else {
          dispose = fn;
        }
      }
    });

    return () => {
      cancelled = true;
      if (typeof dispose === "function") {
        dispose();
        dispose = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, width, height, background, eyeStrength, coreScriptUrl]);

  return (
    <div className="w-full h-full p-2">
      <div
        ref={hostRef}
        className={
          "relative w-full h-full rounded-2xl shadow-lg ring-1 ring-black/5 overflow-hidden select-none " +
          className
        }
        style={{ width, height, background: background === "transparent" ? "transparent" : background }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
        {status !== "ready" && (
          <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">
            {status === "loading" && "模型加载中..."}
            {status === "idle" && "请提供 modelUrl 以加载 Live2D 模型"}
            {status === "error" && <div className="text-red-500">加载失败：{error}</div>}
          </div>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        将鼠标移动到区域内可以驱动眼睛和头部，按住模型可拖拽调整位置。
      </div>
    </div>
  );
}

function setParam(coreModel, id, target, lerp = 0.3) {
  try {
    const current = coreModel.getParameterValueById(id) ?? 0;
    const next = current + (target - current) * clamp(lerp, 0, 1);
    coreModel.setParameterValueById(id, next);
  } catch {}
}

function smoothBackTo(coreModel, list) {
  let frame = 0;
  const max = 20;
  function tick() {
    frame++;
    for (const [id, target] of list) {
      setParam(coreModel, id, target, 0.15);
    }
    if (frame < max) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
