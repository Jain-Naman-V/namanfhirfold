"""namanfhirfold: FHIR clinical-context and token optimization SDK.

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

__version__ = "0.2.1"
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
