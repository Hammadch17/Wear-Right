"""Appearance-based gender suggestion for a scan. Pure Python (no Django), CPU only.

This does not change the skin-tone reading. It runs a small image classifier on the same face
landmarks and returns a label plus model probability and frame agreement. The shopper can always
override it; a low-confidence answer is only a suggestion, never saved silently.

Model: rizvandwiki/gender-classification converted to ONNX by onnx-community.
Labels are 0=female, 1=male. The input is a 224x224 RGB face crop normalised to [-1, 1].
"""
import cv2
import numpy as np

MODEL_NAME = "ViT gender classifier (rizvandwiki/gender-classification)"
CROP_MARGIN = 1.25          # square face box is expanded by this much before resizing
INPUT_SIZE = 224
IMAGE_MEAN = 0.5
IMAGE_STD = 0.5
MAX_CROP_EDGE = 0.9         # never use more than this share of an image's shorter side
CONFIDENCE_HIGH = 75.0
CONFIDENCE_MEDIUM = 50.0


class GenderClassifier:
    """One ONNX session, reused between scans. A missing model never stops a skin-tone scan."""

    def __init__(self, model_path, threads=2):
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        self._session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
        self._input = self._session.get_inputs()[0].name

    def predict(self, bgr, landmarks):
        crop = face_crop(bgr, landmarks)
        if crop is None or crop.size == 0:
            return None
        rgb = cv2.cvtColor(cv2.resize(crop, (INPUT_SIZE, INPUT_SIZE), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        pixels = (rgb.astype(np.float32) / 255.0 - IMAGE_MEAN) / IMAGE_STD
        logits = self._session.run(None, {self._input: pixels.transpose(2, 0, 1)[None]})[0][0]
        probabilities = _softmax(logits)
        # The model's label order is documented by its config: 0 female, 1 male.
        female, male = float(probabilities[0]), float(probabilities[1])
        suggested = "women" if female >= male else "men"
        return {
            "suggested": suggested,
            "probabilities": {"women": round(female, 4), "men": round(male, 4)},
            "confidence": round(100.0 * max(female, male), 1),
            "margin": round(abs(male - female), 4),
        }


def _softmax(values):
    values = np.asarray(values, dtype=np.float64)
    shifted = values - np.max(values)
    exp = np.exp(shifted)
    return exp / exp.sum()


def face_crop(bgr, landmarks):
    """A square crop around the face landmarks, expanded just enough for the classifier.

    Faces near an edge are padded by replication instead of being cut off, so the classifier always
    gets the same square framing.
    """
    if bgr is None or landmarks is None:
        return None
    height, width = bgr.shape[:2]
    points = np.asarray(landmarks, dtype=np.float32)
    x0, y0 = points.min(axis=0)
    x1, y1 = points.max(axis=0)
    side = max(x1 - x0, y1 - y0) * CROP_MARGIN
    side = min(side, min(width, height) * MAX_CROP_EDGE)
    if side < 8:
        return None
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    left = int(round(cx - side / 2.0))
    top = int(round(cy - side / 2.0))
    side = int(round(side))

    pad_left, pad_top = max(0, -left), max(0, -top)
    pad_right, pad_bottom = max(0, left + side - width), max(0, top + side - height)
    if any((pad_left, pad_top, pad_right, pad_bottom)):
        bgr = cv2.copyMakeBorder(bgr, pad_top, pad_bottom, pad_left, pad_right, cv2.BORDER_REPLICATE)
        left += pad_left
        top += pad_top
    return bgr[top:top + side, left:left + side]


def aggregate_gender(frames):
    """Combine per-frame predictions from the frames whose skin-tone reading was usable.

    The probability is a confidence-weighted mean. The reported confidence also falls when frames
    disagree or when only one frame was usable, so a shaky scan cannot look certain.
    """
    readings = [f["gender"] for f in frames if f.get("ok") and f.get("gender")]
    if not readings:
        return None
    weights = np.array([max(0.01, float(f.get("confidence", 0.0))) for f in frames if f.get("ok") and f.get("gender")])
    probabilities = np.array([[r["probabilities"]["women"], r["probabilities"]["men"]] for r in readings])
    mean = (probabilities * weights[:, None]).sum(axis=0) / weights.sum()
    suggested = "women" if mean[0] >= mean[1] else "men"
    labels = [r["suggested"] for r in readings]
    agreement = labels.count(suggested) / len(labels)
    top_probability = float(max(mean))
    if len(labels) == 1:
        confidence = top_probability * 0.9
    else:
        confidence = top_probability * (0.5 + 0.5 * agreement)
    confidence *= 100.0
    return {
        "suggested": suggested,
        "probabilities": {"women": round(float(mean[0]), 4), "men": round(float(mean[1]), 4)},
        "confidence": round(confidence, 1),
        "confidence_label": confidence_label(confidence),
        "agreement": round(agreement, 2),
        "frames_used": len(labels),
        "model": MODEL_NAME,
    }


def confidence_label(score):
    if score >= CONFIDENCE_HIGH:
        return "high"
    if score >= CONFIDENCE_MEDIUM:
        return "medium"
    return "low"


def reasons(gender, lighting="", quality=None):
    """Plain-language evidence for the suggestion; never a claim about facial features."""
    if not gender:
        return ["Gender detection is not available; please choose Men or Women."]
    out = []
    used, agreeing = gender["frames_used"], int(round(gender["agreement"] * gender["frames_used"]))
    if used > 1 and agreeing == used:
        out.append(f"All {used} usable frames agree")
    elif used > 1:
        out.append(f"{agreeing} of {used} usable frames agree")
    else:
        out.append("One usable frame; check the suggestion")
    if lighting:
        out.append(f"Lighting was {lighting.lower()}")
    if quality is not None:
        warned = [c for c in quality.get("checks", []) if c.get("status") != "pass"]
        out.append("Photo quality passed" if not warned else f"{len(warned)} photo quality warning(s)")
    return out
