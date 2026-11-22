package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Email  string `json:"email"`
	Perfil string `json:"perfil"`
	jwt.RegisteredClaims
}

type TokenManager struct {
	secret    []byte
	expiresIn time.Duration
}

func NewTokenManager(secret string, expiresIn time.Duration) *TokenManager {
	return &TokenManager{
		secret:    []byte(secret),
		expiresIn: expiresIn,
	}
}

func (m *TokenManager) Generate(userID, email, perfil string) (string, error) {
	now := time.Now().UTC()
	claims := Claims{
		Email:  email,
		Perfil: perfil,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.expiresIn)),
			Issuer:    "aeronautica-simulados",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *TokenManager) Parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(
		tokenString,
		claims,
		func(token *jwt.Token) (any, error) {
			return m.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer("aeronautica-simulados"),
	)
	if err != nil || !token.Valid || claims.Subject == "" {
		return nil, errors.New("token inválido ou expirado")
	}

	return claims, nil
}
