package curadoria

import (
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

const maxUploadBytes int64 = 5 << 20 // 5 MB

// UploadImagem recebe uma imagem multipart/form-data (campo "file"), valida magic bytes e salva em UPLOADS_DIR.
func (h *Handler) UploadImagem(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)

	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo de 5 MB.")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "Requisição multipart/form-data inválida.")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Arquivo de imagem obrigatório no campo 'file'.")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo de 5 MB.")
			return
		}
		writeJSONError(w, http.StatusBadRequest, "Falha ao ler arquivo enviado.")
		return
	}

	if len(data) == 0 {
		writeJSONError(w, http.StatusBadRequest, "O arquivo enviado está vazio.")
		return
	}
	if int64(len(data)) > maxUploadBytes {
		writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo de 5 MB.")
		return
	}

	headLen := 512
	if len(data) < headLen {
		headLen = len(data)
	}
	detectedType := http.DetectContentType(data[:headLen])

	var ext string
	switch detectedType {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	case "image/webp":
		ext = ".webp"
	default:
		writeJSONError(w, http.StatusBadRequest, "Formato de imagem não permitido. Envie apenas JPEG, PNG ou WebP.")
		return
	}

	uuidStr, err := generateUUIDv4()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao gerar identificador do arquivo.")
		return
	}

	if err := os.MkdirAll(h.uploadsDir, 0o755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao preparar diretório de uploads.")
		return
	}

	filename := uuidStr + ext
	destPath := filepath.Join(h.uploadsDir, filename)

	if err := os.WriteFile(destPath, data, 0o644); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao salvar imagem no servidor.")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"url": "/uploads/" + filename,
	})
}

func generateUUIDv4() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 0x0f) | 0x40 // Versão 4
	b[8] = (b[8] & 0x3f) | 0x80 // Variante RFC 4122

	return fmt.Sprintf(
		"%08x-%04x-%04x-%04x-%012x",
		b[0:4],
		b[4:6],
		b[6:8],
		b[8:10],
		b[10:16],
	), nil
}
