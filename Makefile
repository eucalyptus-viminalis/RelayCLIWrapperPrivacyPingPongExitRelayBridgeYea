.PHONY: social-preview

SOCIAL_HTML ?= assets/social-preview.html
SOCIAL_PNG ?= assets/social-preview.png
SOCIAL_VIEWPORT ?= 1200,630

social-preview:
	bash scripts/capture_social_preview.sh "$(SOCIAL_HTML)" "$(SOCIAL_PNG)" "$(SOCIAL_VIEWPORT)"
