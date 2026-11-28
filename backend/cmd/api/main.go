package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"aeronautica-simulados/backend/internal/auth"
	"aeronautica-simulados/backend/internal/config"
	"aeronautica-simulados/backend/internal/db"
	httpapi "aeronautica-simulados/backend/internal/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("erro de configuração: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("erro ao inicializar banco de dados: %v", err)
	}
	defer pool.Close()

	if err := auth.BootstrapAdmin(ctx, pool, cfg.AdminBootstrapName, cfg.AdminBootstrapEmail, cfg.AdminBootstrapPassword); err != nil {
		log.Fatalf("erro no bootstrap de administrador: %v", err)
	}

	tokens := auth.NewTokenManager(cfg.JWTSecret, cfg.JWTExpiresIn)
	router := httpapi.NewRouter(pool, tokens, cfg.UploadsDir, cfg.AnalyticsIPSalt)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("API Aeronáutica Simulados ouvindo em :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("erro no servidor HTTP: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("encerrando servidor HTTP...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("erro ao encerrar servidor: %v", err)
	}
}
