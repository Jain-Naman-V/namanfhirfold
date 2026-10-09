from setuptools import setup, find_packages

setup(
    name="namanfhirfold",
    version="0.1.0",
    description="Fold the structure. Keep every detail. Task-aware FHIR R4 token compression engine for CDS Hooks and LLMs.",
    long_description=open("README.md", "r", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    author="Naman",
    author_email="naman@scanbo.com",
    url="https://github.com/naman/namanfhirfold",
    packages=find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    python_requires=">=3.8",
)
