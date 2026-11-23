package middleware

import "net/http"

// NoCache melarang penyimpanan respons API di cache (browser, proxy kantor,
// CDN). Seluruh respons API JSON bersifat dinamis dan sebagian besar per-user,
// jadi no-store adalah default yang aman. Vary: Authorization ditambahkan agar
// cache bersyarat (conditional) tidak mencampur respons antar user berbeda.
// Tanpa ini, proxy/CDN dapat menyajikan respons terautentikasi satu user
// ke user lain (TKT-102).
func NoCache(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Cache-Control", "no-store")
		h.Add("Vary", "Authorization")
		next.ServeHTTP(w, r)
	})
}
