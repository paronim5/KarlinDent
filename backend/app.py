from flask import Flask, jsonify, Response, send_from_directory, request
from flask_cors import CORS

from .config import config
from .db import close_pool, init_db_pool
from .clinic import clinic_bp
from .income import income_bp
from .outcome import outcome_bp
from .staff import staff_bp
from .patients import patients_bp
from .schedule import schedule_bp
from .auth import auth_bp, verify_token

# Paths that do NOT require authentication
PUBLIC_PATHS = frozenset([
    "/api/health",
    "/api/auth/login",
    "/api/docs",
    "/api/docs/openapi.yaml",
])


def create_app(testing: bool = False) -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = config.SECRET_KEY

    app.config["TESTING"] = testing

    CORS(app, resources={r"/api/*": {"origins": config.CORS_ORIGINS}})

    if not testing:
        init_db_pool()

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(clinic_bp, url_prefix="/api/clinic")
    app.register_blueprint(income_bp, url_prefix="/api/income")
    app.register_blueprint(outcome_bp, url_prefix="/api/outcome")
    app.register_blueprint(staff_bp, url_prefix="/api/staff")
    app.register_blueprint(patients_bp, url_prefix="/api/patients")
    app.register_blueprint(schedule_bp, url_prefix="/api/schedule")

    @app.before_request
    def require_auth():
        """Reject unauthenticated requests to protected API endpoints."""
        path = request.path
        # Only protect /api/* routes (skip static files, etc.)
        if not path.startswith("/api/"):
            return None
        if path in PUBLIC_PATHS:
            return None
        # Allow CORS preflight
        if request.method == "OPTIONS":
            return None
        auth_header = request.headers.get("Authorization", "")
        token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
        if verify_token(token) is None:
            return jsonify({"error": "unauthorized", "message": "Valid authentication required"}), 401
        return None

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.teardown_appcontext
    def teardown(exception):
        close_pool()

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"error": "bad_request", "message": str(error)}), 400

    @app.errorhandler(401)
    def unauthorized(error):
        return jsonify({"error": "unauthorized", "message": str(error)}), 401

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "not_found", "message": str(error)}), 404

    @app.route("/api/docs/openapi.yaml")
    def openapi_spec():
        return send_from_directory("docs", "openapi.yaml", mimetype="application/yaml")

    @app.route("/api/docs")
    def swagger_ui():
        html = """
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>DentaFlow API Docs</title>
            <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
          </head>
          <body>
            <div id="swagger-ui"></div>
            <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
            <script>
              window.onload = () => {
                window.ui = SwaggerUIBundle({
                  url: '/api/docs/openapi.yaml',
                  dom_id: '#swagger-ui'
                });
              };
            </script>
          </body>
        </html>
        """
        return Response(html, mimetype="text/html")

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({"error": "internal_server_error", "message": "Unexpected error"}), 500

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000)
