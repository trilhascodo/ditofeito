// Placeholder da F0 — páginas reais (home, mercado, perfil, login) entram na F1.
// docs/prototipos/prototipo-mercado.html é o gabarito visual da página de mercado.
export function App() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 20px" }}>
      <h1 style={{ fontFamily: "var(--serif)", fontSize: 32 }}>
        Dito<span style={{ color: "var(--violeta)" }}>Feito</span>
      </h1>
      <p style={{ color: "var(--grafite)" }}>pode escrever — MVP em construção (F0).</p>
    </main>
  );
}
