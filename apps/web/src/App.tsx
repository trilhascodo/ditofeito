import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { RequestPasswordReset } from "./pages/RequestPasswordReset";
import { ResetPassword } from "./pages/ResetPassword";
import { Termos } from "./pages/Termos";
import { Metodologia } from "./pages/Metodologia";
import { Leaderboard } from "./pages/Leaderboard";
import { MarketPage } from "./pages/MarketPage";
import { Profile } from "./pages/Profile";
import { SponsorPanel } from "./pages/SponsorPanel";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminMarkets } from "./admin/AdminMarkets";
import { AdminMarketNew } from "./admin/AdminMarketNew";
import { AdminMarketDetail } from "./admin/AdminMarketDetail";
import { AdminCandidates } from "./admin/AdminCandidates";
import { AdminSponsors } from "./admin/AdminSponsors";
import { AdminHomeLinks } from "./admin/AdminHomeLinks";
import { AdminLeads } from "./admin/AdminLeads";
import { AdminUsers } from "./admin/AdminUsers";
import { AdminAudience } from "./admin/AdminAudience";
import { Anuncie } from "./pages/Anuncie";
import { Indice } from "./pages/Indice";
import { Indices } from "./pages/Indices";
import { AdminIndices } from "./admin/AdminIndices";
import { AdminMarketRequests } from "./admin/AdminMarketRequests";
import { AdminComments } from "./admin/AdminComments";
import { SolicitarMercado } from "./pages/SolicitarMercado";
import { AdminEmailSettings } from "./admin/AdminEmailSettings";
import { AdminSuspicious } from "./admin/AdminSuspicious";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/entrar", element: <Login /> },
      { path: "/cadastro", element: <Signup /> },
      { path: "/esqueci-senha", element: <RequestPasswordReset /> },
      { path: "/redefinir-senha", element: <ResetPassword /> },
      { path: "/termos", element: <Termos /> },
      { path: "/metodologia", element: <Metodologia /> },
      { path: "/ranking", element: <Leaderboard /> },
      { path: "/m/:slug", element: <MarketPage /> },
      { path: "/perfil", element: <Profile /> },
      { path: "/patrocinador", element: <SponsorPanel /> },
      { path: "/anuncie", element: <Anuncie /> },
      { path: "/indices", element: <Indices /> },
      { path: "/indice/:slug", element: <Indice /> },
      { path: "/solicitar-mercado", element: <SolicitarMercado /> },
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminMarkets /> },
          { path: "mercados", element: <AdminMarkets /> },
          { path: "mercados/novo", element: <AdminMarketNew /> },
          { path: "mercados/:slug", element: <AdminMarketDetail /> },
          { path: "candidatos", element: <AdminCandidates /> },
          { path: "patrocinadores", element: <AdminSponsors /> },
          { path: "links-home", element: <AdminHomeLinks /> },
          { path: "leads", element: <AdminLeads /> },
          { path: "usuarios", element: <AdminUsers /> },
          { path: "audiencia", element: <AdminAudience /> },
          { path: "indices", element: <AdminIndices /> },
          { path: "solicitacoes-mercado", element: <AdminMarketRequests /> },
          { path: "comentarios", element: <AdminComments /> },
          { path: "email", element: <AdminEmailSettings /> },
          { path: "suspeitas", element: <AdminSuspicious /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
