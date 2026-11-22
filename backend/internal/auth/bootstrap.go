package auth

import (
	"context"
	"fmt"
	"log"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

// BootstrapAdmin cria opcionalmente o primeiro administrador caso ADMIN_BOOTSTRAP_EMAIL
// e ADMIN_BOOTSTRAP_PASSWORD estejam configurados no ambiente e ainda não exista um ADMIN.
func BootstrapAdmin(ctx context.Context, pool *pgxpool.Pool, nome, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" && password == "" {
		return nil
	}

	if email == "" || password == "" {
		return fmt.Errorf("para bootstrap de ADMIN, defina tanto ADMIN_BOOTSTRAP_EMAIL quanto ADMIN_BOOTSTRAP_PASSWORD")
	}

	if !isValidEmail(email) {
		return fmt.Errorf("ADMIN_BOOTSTRAP_EMAIL inválido")
	}

	if utf8.RuneCountInString(password) < 8 {
		return fmt.Errorf("ADMIN_BOOTSTRAP_PASSWORD deve ter pelo menos 8 caracteres")
	}

	var adminExists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM usuarios WHERE perfil = $1)`, "ADMIN").Scan(&adminExists); err != nil {
		return fmt.Errorf("falha ao verificar existência de ADMIN: %w", err)
	}
	if adminExists {
		return nil
	}

	hash, err := HashPassword(password)
	if err != nil {
		return fmt.Errorf("falha ao gerar hash da senha do ADMIN: %w", err)
	}

	tag, err := pool.Exec(
		ctx,
		`INSERT INTO usuarios (nome, email, senha_hash, perfil)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (email) DO NOTHING`,
		nome,
		email,
		hash,
		"ADMIN",
	)
	if err != nil {
		return fmt.Errorf("falha ao criar usuário ADMIN inicial: %w", err)
	}

	if tag.RowsAffected() > 0 {
		log.Printf("bootstrap: primeiro administrador criado (%s)", email)
	}

	return nil
}
