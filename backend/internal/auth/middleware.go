package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type contextKey string

const claimsContextKey contextKey = "auth_claims"

const AccountDisabledMessage = "Conta desabilitada. Entre em contato com o instrutor."

func ClaimsFromContext(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(*Claims)
	return claims, ok && claims != nil
}

// RequireAuth valida o JWT Bearer e consulta o campo `ativo` por PK no PostgreSQL,
// garantindo revogação imediata de acesso caso o usuário tenha sido desabilitado.
func RequireAuth(tokens *TokenManager, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authHeader == "" {
				writeJSONError(w, http.StatusUnauthorized, "Token de autenticação não informado.")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
				writeJSONError(w, http.StatusUnauthorized, "Cabeçalho Authorization inválido.")
				return
			}

			claims, err := tokens.Parse(strings.TrimSpace(parts[1]))
			if err != nil {
				writeJSONError(w, http.StatusUnauthorized, "Sessão inválida ou expirada.")
				return
			}

			var ativo bool
			err = pool.QueryRow(
				r.Context(),
				`SELECT ativo FROM usuarios WHERE id = $1::uuid`,
				claims.Subject,
			).Scan(&ativo)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					writeJSONError(w, http.StatusUnauthorized, "Sessão inválida ou usuário não encontrado.")
					return
				}
				writeJSONError(w, http.StatusInternalServerError, "Erro ao validar status da conta.")
				return
			}

			if !ativo {
				writeJSONErrorWithCode(w, http.StatusForbidden, AccountDisabledMessage, "ACCOUNT_DISABLED")
				return
			}

			ctx := context.WithValue(r.Context(), claimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := ClaimsFromContext(r.Context())
		if !ok {
			writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
			return
		}
		if claims.Perfil != "ADMIN" {
			writeJSONError(w, http.StatusForbidden, "Acesso restrito a administradores.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func writeJSONErrorWithCode(w http.ResponseWriter, status int, message, code string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
		"code":  code,
	})
}
