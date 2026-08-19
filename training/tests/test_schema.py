import json

import pytest

from spinemetrics_training.schema import (
    STUDY_EXPORT_FORMAT_VERSION,
    discover_dataset,
    load_study_export,
    parse_study,
    trustworthy_vertebrae,
)
from tests.conftest import make_point, make_study_export, make_vertebra


def test_parse_study_reconstructs_vertebrae(study_export_dict):
    study = parse_study(study_export_dict["study"])
    assert study.patient_ref == "SM-test"
    assert len(study.radiographs) == 1
    radiograph = study.radiographs[0]
    assert [v.level for v in radiograph.vertebrae] == ["T5", "T12"]
    assert radiograph.vertebrae[0].superior_endplate[0].x == 80  # 100 - 20


def test_parse_study_handles_optional_fields():
    vertebra = make_vertebra(
        "T8",
        150,
        150,
        centroid=make_point(150, 150),
        confidence=0.82,
        edited=True,
    )
    export = make_study_export(vertebrae=[vertebra])
    study = parse_study(export["study"])
    v = study.radiographs[0].vertebrae[0]
    assert v.confidence == pytest.approx(0.82)
    assert v.edited is True
    assert v.centroid is not None


def test_load_study_export_round_trip(tmp_path, study_export_dict):
    path = tmp_path / "study.json"
    path.write_text(json.dumps(study_export_dict))
    study = load_study_export(path)
    assert study.patient_ref == "SM-test"


def test_load_study_export_rejects_unsupported_version(tmp_path, study_export_dict):
    study_export_dict["formatVersion"] = 999
    path = tmp_path / "study.json"
    path.write_text(json.dumps(study_export_dict))
    with pytest.raises(ValueError, match="versión de formato"):
        load_study_export(path)


def test_load_study_export_rejects_malformed_json(tmp_path):
    path = tmp_path / "study.json"
    path.write_text(json.dumps({"nope": True}))
    with pytest.raises(ValueError, match="no contiene un estudio"):
        load_study_export(path)


class TestTrustworthyVertebrae:
    def test_manual_source_trusts_all_vertebrae(self, study_export_dict):
        study = parse_study(study_export_dict["study"])
        radiograph = study.radiographs[0]
        result = trustworthy_vertebrae(radiograph, "manual")
        assert len(result) == 2

    def test_auto_source_trusts_none(self, study_export_dict):
        study = parse_study(study_export_dict["study"])
        radiograph = study.radiographs[0]
        assert trustworthy_vertebrae(radiograph, "auto") == []

    def test_auto_edited_trusts_only_edited_vertebrae(self):
        edited = make_vertebra("T5", 100, 100, edited=True)
        unedited = make_vertebra("T12", 100, 300, edited=False)
        export = make_study_export(vertebrae=[edited, unedited], measurement_source="auto-edited")
        study = parse_study(export["study"])
        radiograph = study.radiographs[0]
        result = trustworthy_vertebrae(radiograph, "auto-edited")
        assert [v.level for v in result] == ["T5"]


class TestDiscoverDataset:
    def test_pairs_json_with_matching_image(self, dataset_dir):
        samples = discover_dataset(dataset_dir)
        assert len(samples) == 1
        assert samples[0].json_path.name == "sample_001.json"
        assert samples[0].image_path.name == "sample_001.png"

    def test_raises_when_image_missing(self, tmp_path, study_export_dict):
        (tmp_path / "orphan.json").write_text(json.dumps(study_export_dict))
        with pytest.raises(FileNotFoundError, match="orphan"):
            discover_dataset(tmp_path)

    def test_empty_directory_yields_no_samples(self, tmp_path):
        assert discover_dataset(tmp_path) == []


def test_study_export_format_version_matches_app():
    # Si esto falla, `src/storage/jsonExport.ts` cambió STUDY_EXPORT_FORMAT_VERSION
    # y este módulo debe actualizarse en el mismo cambio.
    assert STUDY_EXPORT_FORMAT_VERSION == 1
