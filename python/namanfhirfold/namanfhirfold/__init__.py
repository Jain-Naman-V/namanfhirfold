"""namanfhirfold: Fold the structure. Keep every detail.

High-efficiency task-aware FHIR R4 token compression engine.
"""

from .core import (
    fold,
    fold_with_provenance,
    expand,
    expand_from_map,
    FoldOptions,
    FoldResult,
    ProvenanceEntry,
    CdsProfile,
    Granularity,
    CompressionFormat,
)

__version__ = "0.1.0"
__all__ = [
    "fold",
    "fold_with_provenance",
    "expand",
    "expand_from_map",
    "FoldOptions",
    "FoldResult",
    "ProvenanceEntry",
    "CdsProfile",
    "Granularity",
    "CompressionFormat",
]
