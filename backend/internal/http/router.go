package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"aeronautica-simulados/backend/internal/auth"
	"aeronautica-simulados/backend/internal/curadoria"
	"aeronautica-simulados/backend/internal/simulado"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
)

func NewRouter(pool *pgxpool.Pool, tokens *auth.TokenManager, uploadsDir string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	authHandler := auth.NewHandler(pool, tokens)
	curadoriaHandler := curadoria.NewHandler(pool, uploadsDir)
	simuladoHandler := simulado.NewHandler(pool)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, req *http.Request) {
			pingCtx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
			defer cancel()

			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			if err := pool.Ping(pingCtx); err != nil {
				w.WriteHeader(http.StatusServiceUnavailable)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"status":   "error",
					"database": "unreachable",
				})
				return
			}

			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"status":   "ok",
				"database": "connected",
			})
		})

		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
			r.With(auth.RequireAuth(tokens)).Get("/me", authHandler.Me)
		})

		r.With(auth.RequireAuth(tokens)).Get("/categorias", curadoriaHandler.ListCategorias)

		r.Route("/simulados", func(r chi.Router) {
			r.Use(auth.RequireAuth(tokens))

			r.Post("/", simuladoHandler.Create)
			r.Get("/", simuladoHandler.List)
			r.Get("/{id}", simuladoHandler.GetByID)
			r.Post("/{id}/finalizar", simuladoHandler.Finalize)
		})

		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.RequireAuth(tokens))
			r.Use(auth.RequireAdmin)

			r.Post("/uploads", curadoriaHandler.UploadImagem)
			r.Post("/categorias", curadoriaHandler.CreateCategoria)
			r.Get("/questoes", curadoriaHandler.ListQuestoes)
			r.Post("/questoes", curadoriaHandler.CreateQuestao)
			r.Put("/questoes/{id}", curadoriaHandler.UpdateQuestao)
			r.Delete("/questoes/{id}", curadoriaHandler.DeleteQuestao)
		})
	})

	return r
}
