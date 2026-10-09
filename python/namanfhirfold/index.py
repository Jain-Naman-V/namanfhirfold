"""
namanfhirfold - Vercel Python Service Handler
"Fold the structure. Keep every detail."

Provides HTTP handler for Vercel internal service bindings or public API invocations.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import sys

# Ensure local package directory is on Python path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from namanfhirfold.core import fold

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        response = {
            "service": "namanfhirfold",
            "runtime": "python",
            "version": "0.1.0",
            "status": "healthy",
            "tagline": "Fold the structure. Keep every detail."
        }
        self.wfile.write(json.dumps(response).encode("utf-8"))

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
            raw_fhir = body.get("fhir") or body.get("bundle") or body
            format_opt = body.get("format", "compact_json")
            profile_opt = body.get("profile", "free_query")
            granularity_opt = body.get("granularity", "exact_timestamp")
            token_budget = body.get("token_budget")
            query_filter = body.get("query_filter")

            folded = fold(
                raw_fhir_input=raw_fhir,
                format=format_opt,
                profile=profile_opt,
                granularity=granularity_opt,
                token_budget=token_budget,
                query_filter=query_filter
            )

            raw_str = json.dumps(raw_fhir) if not isinstance(raw_fhir, str) else raw_fhir
            raw_tokens = max(1, round(len(raw_str) / 3.8))
            folded_tokens = max(1, round(len(folded) / 3.8))
            savings_pct = round(((raw_tokens - folded_tokens) / raw_tokens) * 100, 1) if raw_tokens > 0 else 0

            # Try to return parsed JSON if compact_json format, else text string
            compact_payload = folded
            if format_opt == "compact_json":
                try:
                    compact_payload = json.loads(folded)
                except Exception:
                    compact_payload = folded

            response_data = {
                "compact": compact_payload,
                "engine": "namanfhirfold-python",
                "format": format_opt,
                "profile": profile_opt,
                "granularity": granularity_opt,
                "metrics": {
                    "rawTokens": raw_tokens,
                    "compactTokens": folded_tokens,
                    "tokensSaved": max(0, raw_tokens - folded_tokens),
                    "reductionPercentage": savings_pct,
                    "compressionRatio": round(raw_tokens / max(1, folded_tokens), 1)
                }
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode("utf-8"))

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            error_response = {
                "error": str(e),
                "engine": "namanfhirfold-python"
            }
            self.wfile.write(json.dumps(error_response).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
