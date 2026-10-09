"""namanfhirfold: Fold the structure. Keep every detail.

High-efficiency task-aware FHIR R4 token compression engine.
"""

from .core import fold, FoldOptions, CdsProfile, Granularity, CompressionFormat

__version__ = "0.1.0"
__all__ = ["fold", "FoldOptions", "CdsProfile", "Granularity", "CompressionFormat"]
