import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

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

const MOTION_PRESETS = {
  happy_jump: { duration: 1600, params: { ParamBodyAngleX: 10, ParamBodyAngleY: 6, ParamAngleZ: 12 } },
  happy_smile: { duration: 1200, params: { ParamBodyAngleX: 4, ParamBodyAngleY: 3, ParamAngleZ: 6 } },
  sad_drop: { duration: 1800, params: { ParamBodyAngleX: -8, ParamBodyAngleY: -6, ParamAngleZ: -6 } },
  sad_idle: { duration: 1400, params: { ParamBodyAngleX: -3, ParamBodyAngleY: -2 } },
  angry_point: { duration: 1500, params: { ParamBodyAngleX: 6, ParamBodyAngleY: -4, ParamAngleZ: 8 } },
  angry_idle: { duration: 1200, params: { ParamBodyAngleX: 3, ParamBodyAngleY: -2 } },
  surprised_react: { duration: 1600, params: { ParamBodyAngleX: 5, ParamBodyAngleY: 8, ParamAngleZ: -6 } },
  pose_proud: { duration: 2000, params: { ParamBodyAngleX: 6, ParamBodyAngleY: 4, ParamAngleZ: -4 } },
  gentle_wave: { duration: 2000, params: { ParamBodyAngleX: 4, ParamBodyAngleY: 2 } },
  idle_emphatic: { duration: 1400, params: { ParamBodyAngleX: 3, ParamBodyAngleY: 2 } },
  idle_breathe: { duration: 1600, params: { ParamBodyAngleX: 1.5, ParamBodyAngleY: 1.5 } },
};

const EMOTION_PRESETS = {
  neutral: {},
  happy: {
    ParamEyeSmileL: 0.6,
    ParamEyeSmileR: 0.6,
    ParamMouthForm: 0.5,
    ParamCheekpuff: 0.35,
  },
  sad: {
    ParamEyeSmileL: -0.4,
    ParamEyeSmileR: -0.4,
    ParamMouthForm: -0.45,
    ParamBrowFormL: 0.4,
    ParamBrowFormR: 0.4,
  },
  angry: {
    ParamEyeSmileL: -0.35,
    ParamEyeSmileR: -0.35,
    ParamMouthForm: -0.3,
    ParamBrowAngleL: 0.6,
    ParamBrowAngleR: -0.6,
  },
  surprised: {
    ParamMouthOpenY: 0.7,
    ParamMouthForm: 0.2,
    ParamEyeOpenL: 0.1,
    ParamEyeOpenR: 0.1,
    ParamBrowAngleL: -0.4,
    ParamBrowAngleR: -0.4,
  },
  gentle: {
    ParamEyeSmileL: 0.45,
    ParamEyeSmileR: 0.45,
    ParamMouthForm: 0.35,
  },
  confident: {
    ParamEyeSmileL: 0.25,
    ParamEyeSmileR: 0.25,
    ParamMouthForm: 0.4,
    ParamBrowAngleL: -0.25,
    ParamBrowAngleR: -0.25,
  },
};

const KNOWN_EMOTION_PARAMS = Array.from(
  new Set(Object.values(EMOTION_PRESETS).flatMap((preset) => Object.keys(preset)))
);

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

const Live2DContainer = forwardRef(function Live2DContainer({
  modelUrl,
  width = 480,
  height = 480,
  eyeStrength = 1.0,
  background = "transparent",
  className = "",
  coreScriptUrl = DEFAULT_CORE_SCRIPT_URL,
  onReady = undefined,
  onStatusChange = undefined,
}, ref) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const appRef = useRef(null);
  const modelRef = useRef(null);
  const rafRef = useRef(null);
  const draggingRef = useRef({ dragging: false, offset: { x: 0, y: 0 } });
  const pointerInsideRef = useRef(false);
  const mouthStateRef = useRef({ target: 0, value: 0, holdUntil: 0 });
  const emotionStateRef = useRef({ label: "neutral", targets: {}, expiresAt: 0, intensity: 0.4 });
  const motionStateRef = useRef(null);
  const controlsRef = useRef(null);
  const statusRef = useRef("init");

  const [status, setStatus] = useState("init");
  const [error, setError] = useState(null);

  useEffect(() => {
    statusRef.current = status;
    if (typeof onStatusChange === "function") {
      onStatusChange(status, error);
    }
  }, [status, error, onStatusChange]);

  const setMouthTarget = useCallback((value = 0, holdMs = 0) => {
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
    const safeValue = clamp(numeric, 0, 1);
    const state = mouthStateRef.current;
    state.target = safeValue;
    const time = now();
    if (safeValue > 0.02) {
      state.holdUntil = time + Math.max(holdMs, 120);
    } else {
      state.holdUntil = time;
    }
  }, []);

  const playMotion = useCallback((motion, options = {}) => {
    const name = typeof motion === "string" ? motion.trim() : "";
    if (!name) {
      return;
    }
    const preset = MOTION_PRESETS[name];
    const time = now();
    const intensitySource =
      typeof options === "object" && options !== null
        ? options.intensity ?? options.Intensity ?? 0.65
        : 0.65;
    const intensity = clamp(
      typeof intensitySource === "number" && Number.isFinite(intensitySource)
        ? intensitySource
        : 0.65,
      0,
      1,
    );

    if (!preset) {
      motionStateRef.current = {
        params: {
          ParamBodyAngleX: 4 * intensity,
          ParamBodyAngleY: 3 * intensity,
          ParamAngleZ: 5 * intensity,
        },
        expiresAt: time + 1200,
        fadeOut: 360,
      };
      return;
    }

    const params = {};
    for (const [param, value] of Object.entries(preset.params ?? {})) {
      params[param] = value * (0.4 + intensity * 0.6);
    }

    motionStateRef.current = {
      params,
      expiresAt: time + (preset.duration ?? 1400),
      fadeOut: 400,
    };
  }, []);

  const setEmotionState = useCallback(
    (emotion) => {
      const time = now();
      const targets = createEmotionTargetBaseline();

      if (!emotion) {
        emotionStateRef.current = {
          label: "neutral",
          targets,
          intensity: 0.35,
          expiresAt: time + 1200,
          mouthBoost: 0,
        };
        return;
      }

      const labelSource =
        typeof emotion === "string"
          ? emotion
          : emotion?.label ?? emotion?.Label ?? "neutral";
      const normalizedLabel =
        typeof labelSource === "string" ? labelSource.toLowerCase().trim() : "neutral";
      const presetKey = Object.prototype.hasOwnProperty.call(
        EMOTION_PRESETS,
        normalizedLabel,
      )
        ? normalizedLabel
        : "neutral";

      const rawIntensity =
        typeof emotion === "object" && emotion !== null
          ? typeof emotion.intensity === "number"
            ? emotion.intensity
            : typeof emotion.Intensity === "number"
              ? emotion.Intensity
              : 0.5
          : 0.5;
      const intensity = clamp(rawIntensity, 0, 1);

      const preset = EMOTION_PRESETS[presetKey] ?? EMOTION_PRESETS.neutral;
      let mouthBoost = 0;

      for (const [param, value] of Object.entries(preset)) {
        const scaled = value * (0.4 + intensity * 0.6);
        if (param === "ParamMouthOpenY") {
          mouthBoost = clamp(Math.abs(scaled), 0, 1);
        } else {
          targets[param] = scaled;
        }
      }

      const duration = 2000 + intensity * 2000;

      emotionStateRef.current = {
        label: presetKey,
        targets,
        intensity,
        expiresAt: time + duration,
        mouthBoost,
      };

      const suggestedMotion =
        typeof emotion === "object" && emotion !== null
          ? emotion.suggested_motion ?? emotion.SuggestedMotion ?? ""
          : "";
      if (suggestedMotion) {
        playMotion(String(suggestedMotion), { intensity });
      }
    },
    [playMotion],
  );

  const clearEmotionState = useCallback(() => {
    setEmotionState(null);
  }, [setEmotionState]);

  const updateMouthFrame = useCallback((coreModel) => {
    if (!coreModel) {
      return;
    }
    const state = mouthStateRef.current;
    const emotion = emotionStateRef.current;
    const time = now();

    if (state.holdUntil && time > state.holdUntil && state.target < 0.05) {
      state.target = 0;
    }

    const target = Math.max(state.target, emotion?.mouthBoost ?? 0);
    const smoothing = target > state.value ? 0.35 : 0.22;
    const next = state.value + (target - state.value) * smoothing;
    state.value = clamp(next, 0, 1);

    try {
      coreModel.setParameterValueById("ParamMouthOpenY", state.value);
    } catch (error) {
      // ignore missing parameter
    }
  }, []);

  const updateEmotionFrame = useCallback((coreModel) => {
    if (!coreModel) {
      return;
    }
    const state = emotionStateRef.current;
    const time = now();

    if (!state) {
      return;
    }

    if (state.expiresAt && time > state.expiresAt && state.label !== "neutral") {
      emotionStateRef.current = {
        label: "neutral",
        targets: createEmotionTargetBaseline(),
        intensity: 0.3,
        expiresAt: time + 1000,
        mouthBoost: 0,
      };
    }

    const active = emotionStateRef.current;
    const targets = active.targets ?? {};
    const lerpStrength = 0.12 + (active.intensity ?? 0.3) * 0.12;

    for (const param of KNOWN_EMOTION_PARAMS) {
      if (param === "ParamMouthOpenY") {
        continue;
      }
      const goal = targets[param] ?? 0;
      setParam(coreModel, param, goal, lerpStrength);
    }
  }, []);

  const updateMotionFrame = useCallback((coreModel) => {
    if (!coreModel) {
      return;
    }
    const motion = motionStateRef.current;
    if (!motion) {
      return;
    }
    const time = now();
    const params = motion.params ?? {};

    if (motion.expiresAt && time > motion.expiresAt) {
      const fade = motion.fadeOut ?? 320;
      const elapsed = time - motion.expiresAt;
      if (elapsed >= fade) {
        motionStateRef.current = null;
        return;
      }
      const factor = clamp(1 - elapsed / fade, 0, 1);
      for (const [param, value] of Object.entries(params)) {
        setParam(coreModel, param, value * factor, 0.2);
      }
      return;
    }

    for (const [param, value] of Object.entries(params)) {
      setParam(coreModel, param, value, 0.2);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    setMouthOpen: (value, holdMs) => {
      const controls = controlsRef.current;
      if (controls?.setMouthOpen) {
        controls.setMouthOpen(value, holdMs);
        return;
      }
      setMouthTarget(value, holdMs);
    },
    setEmotion: (emotion) => {
      const controls = controlsRef.current;
      if (controls?.setEmotion) {
        controls.setEmotion(emotion);
        return;
      }
      setEmotionState(emotion);
    },
    clearEmotion: () => {
      const controls = controlsRef.current;
      if (controls?.clearEmotion) {
        controls.clearEmotion();
        return;
      }
      clearEmotionState();
    },
    playMotion: (motion, options) => {
      const controls = controlsRef.current;
      if (controls?.playMotion) {
        controls.playMotion(motion, options);
        return;
      }
      playMotion(motion, options);
    },
  }));

  const hostClasses = [
    "relative overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 select-none",
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
        canvas.style.borderRadius = "inherit";

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

          const controls = {
            setMouthOpen: (value, holdMs) => setMouthTarget(value, holdMs),
            setEmotion: setEmotionState,
            clearEmotion: clearEmotionState,
            playMotion,
          };
          controlsRef.current = controls;
          clearEmotionState();
          setMouthTarget(0, 0);
          if (typeof onReady === "function") {
            onReady(controls);
          }

          const paddingRatio = 0.06;
          const targetWidth = width * (1 - paddingRatio);
          const targetHeight = height * (1 - paddingRatio);
          const scale = Math.min(targetWidth / model.width, targetHeight / model.height);
          model.scale.set(scale);
          const verticalOffset = height * 0.1;
          model.position.set(width / 2, height + verticalOffset);
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

            const core = model.internalModel.coreModel;
            updateMouthFrame(core);
            updateEmotionFrame(core);
            updateMotionFrame(core);

            if (pointerInsideRef.current || draggingRef.current.dragging) {
              return;
            }

            idleClock += app.ticker.deltaMS / 1000;

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
            controlsRef.current = null;
            mouthStateRef.current = { target: 0, value: 0, holdUntil: 0 };
            emotionStateRef.current = {
              label: "neutral",
              targets: createEmotionTargetBaseline(),
              intensity: 0.3,
              expiresAt: now() + 1000,
              mouthBoost: 0,
            };
            motionStateRef.current = null;
            if (typeof onReady === "function") {
              onReady(null);
            }
          }
        };

        return cleanup;
      } catch (err) {
        console.error(err);
        controlsRef.current = null;
        motionStateRef.current = null;
        mouthStateRef.current = { target: 0, value: 0, holdUntil: 0 };
        emotionStateRef.current = {
          label: "neutral",
          targets: createEmotionTargetBaseline(),
          intensity: 0.3,
          expiresAt: now() + 1000,
          mouthBoost: 0,
        };
        if (typeof onReady === "function") {
          onReady(null);
        }
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
  }, [modelUrl, width, height, background, eyeStrength, coreScriptUrl, setMouthTarget, playMotion, setEmotionState, clearEmotionState, updateMouthFrame, updateEmotionFrame, updateMotionFrame, onReady]);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        ref={hostRef}
        className={hostClasses}
        style={{
          width,
          height,
          background: background === "transparent" ? "transparent" : background,
        }}
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
      <div className="text-center text-xs text-gray-500">
        将鼠标移动到区域内可以驱动眼睛和头部，按住模型可拖拽调整位置。
      </div>
    </div>
  );
});

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createEmotionTargetBaseline() {
  const baseline = {};
  for (const key of KNOWN_EMOTION_PARAMS) {
    if (key === "ParamMouthOpenY") {
      continue;
    }
    baseline[key] = 0;
  }
  return baseline;
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


export default Live2DContainer;
