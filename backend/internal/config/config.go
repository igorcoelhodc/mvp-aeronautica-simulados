package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                   string
	DatabaseURL            string
	JWTSecret              string
	JWTExpiresIn           time.Duration
	UploadsDir             string
	AnalyticsIPSalt        string
	AdminBootstrapName     string
	AdminBootstrapEmail    string
	AdminBootstrapPassword string
}

func Load() (*Config, error) {
	port := strings.TrimSpace(os.Getenv("API_PORT"))
	if port == "" {
		port = "8080"
	}

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		return nil, errors.New("variável de ambiente DATABASE_URL é obrigatória")
	}

	jwtSecret := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if len(jwtSecret) < 32 {
		return nil, errors.New("variável de ambiente JWT_SECRET é obrigatória e deve ter pelo menos 32 caracteres")
	}

	expiresHours := 24
	if raw := strings.TrimSpace(os.Getenv("JWT_EXPIRES_HOURS")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			return nil, errors.New("JWT_EXPIRES_HOURS deve ser um número inteiro positivo")
		}
		expiresHours = parsed
	}

	adminName := strings.TrimSpace(os.Getenv("ADMIN_BOOTSTRAP_NAME"))
	if adminName == "" {
		adminName = "Administrador"
	}

	uploadsDir := strings.TrimSpace(os.Getenv("UPLOADS_DIR"))
	if uploadsDir == "" {
		uploadsDir = "/data/uploads"
	}

	analyticsSalt := strings.TrimSpace(os.Getenv("ANALYTICS_IP_SALT"))
	if analyticsSalt == "" {
		analyticsSalt = jwtSecret
	}

	return &Config{
		Port:                   port,
		DatabaseURL:            dbURL,
		JWTSecret:              jwtSecret,
		JWTExpiresIn:           time.Duration(expiresHours) * time.Hour,
		UploadsDir:             uploadsDir,
		AnalyticsIPSalt:        analyticsSalt,
		AdminBootstrapName:     adminName,
		AdminBootstrapEmail:    strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_BOOTSTRAP_EMAIL"))),
		AdminBootstrapPassword: os.Getenv("ADMIN_BOOTSTRAP_PASSWORD"),
	}, nil
}
