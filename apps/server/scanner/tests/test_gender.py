import numpy as np

from scanner.engine.gender import aggregate_gender, confidence_label, face_crop


def landmarks(x0=100, y0=80, x1=300, y1=380):
    """A face oval: enough spread for the crop, with one point per corner."""
    return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float32)


def frame(suggested, women, men, confidence=80.0):
    return {
        "ok": True,
        "confidence": confidence,
        "gender": {
            "suggested": suggested,
            "probabilities": {"women": women, "men": men},
            "confidence": 100 * max(women, men),
            "margin": abs(women - men),
        },
    }


def test_face_crop_is_square_and_expanded_around_the_face():
    image = np.zeros((500, 400, 3), dtype=np.uint8)
    crop = face_crop(image, landmarks(100, 80, 300, 380))
    assert crop is not None and crop.shape[0] == crop.shape[1]
    assert crop.shape[0] > 300


def test_face_crop_pads_a_face_at_the_image_edge_instead_of_cutting_it():
    image = np.zeros((200, 200, 3), dtype=np.uint8)
    crop = face_crop(image, landmarks(-20, -20, 60, 60))
    assert crop is not None and crop.shape[0] == crop.shape[1]


def test_frames_that_agree_give_a_high_confidence_suggestion():
    gender = aggregate_gender([frame("men", 0.02, 0.98), frame("men", 0.03, 0.97)])
    assert gender["suggested"] == "men"
    assert gender["agreement"] == 1.0 and gender["frames_used"] == 2
    assert gender["confidence"] > 90 and gender["confidence_label"] == "high"


def test_disagreeing_frames_lower_the_confidence_and_are_honest_about_it():
    gender = aggregate_gender([frame("men", 0.49, 0.51), frame("women", 0.52, 0.48)])
    assert gender["agreement"] == 0.5 and gender["frames_used"] == 2
    assert gender["confidence_label"] == "low"


def test_one_frame_cannot_look_as_certain_as_an_agreed_scan():
    gender = aggregate_gender([frame("women", 0.99, 0.01)])
    assert gender["suggested"] == "women" and 80 < gender["confidence"] < 99


def test_no_usable_frame_means_no_gender_suggestion():
    assert aggregate_gender([{"ok": False}, {"ok": True, "gender": None}]) is None


def test_confidence_words_follow_the_same_thresholds_as_the_cards():
    assert (confidence_label(80), confidence_label(60), confidence_label(10)) == ("high", "medium", "low")
