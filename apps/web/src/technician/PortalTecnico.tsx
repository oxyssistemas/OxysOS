import { Route, Routes } from "react-router-dom";
import { NaoEncontradoPage } from "@/app/pages/NaoEncontradoPage";
import { TecnicoProvider } from "./TecnicoContext";
import { GuardaTecnico } from "./GuardaTecnico";
import { LayoutTecnico } from "./layout/LayoutTecnico";
import { HomeTecnicoPage } from "./paginas/HomeTecnicoPage";
import { PerfilTecnicoPage } from "./paginas/PerfilTecnicoPage";
import { AgendaTecnicoPage } from "./paginas/AgendaTecnicoPage";
import { AtendimentoTecnicoPage } from "./paginas/AtendimentoTecnicoPage";
import { HorasAtendimentoPage } from "./paginas/HorasAtendimentoPage";
import { ChecklistAtendimentoPage } from "./paginas/ChecklistAtendimentoPage";
import { EvidenciasAtendimentoPage } from "./paginas/EvidenciasAtendimentoPage";
import { MateriaisAtendimentoPage } from "./paginas/MateriaisAtendimentoPage";
import { AssinaturaAtendimentoPage } from "./paginas/AssinaturaAtendimentoPage";
import { DiagnosticoAtendimentoPage } from "./paginas/DiagnosticoAtendimentoPage";
import { FinalizarAtendimentoPage } from "./paginas/FinalizarAtendimentoPage";
import { RelatorioAtendimentoPage } from "./paginas/RelatorioAtendimentoPage";
import { NotificacoesTecnicoPage } from "./paginas/NotificacoesTecnicoPage";
import { SincronizacaoPage } from "./paginas/SincronizacaoPage";
import { SincronizacaoProvider } from "./offline/SincronizacaoContext";
import { usePwaTecnico } from "./offline/pwa";

/** /technician — portal de campo (mobile first), separado do /app. */
export function PortalTecnico() {
  usePwaTecnico();
  return (
    <TecnicoProvider>
      <GuardaTecnico>
        <SincronizacaoProvider>
          <Routes>
            <Route element={<LayoutTecnico />}>
              <Route index element={<HomeTecnicoPage />} />
              <Route path="agenda" element={<AgendaTecnicoPage />} />
              <Route path="jobs" element={<AtendimentoTecnicoPage atual />} />
              <Route path="jobs/:id" element={<AtendimentoTecnicoPage />} />
              <Route path="jobs/:id/horas" element={<HorasAtendimentoPage />} />
              <Route path="jobs/:id/checklist" element={<ChecklistAtendimentoPage />} />
              <Route path="jobs/:id/fotos" element={<EvidenciasAtendimentoPage />} />
              <Route path="jobs/:id/materiais" element={<MateriaisAtendimentoPage />} />
              <Route path="jobs/:id/assinatura" element={<AssinaturaAtendimentoPage />} />
              <Route path="jobs/:id/diagnostico" element={<DiagnosticoAtendimentoPage />} />
              <Route path="jobs/:id/finalizar" element={<FinalizarAtendimentoPage />} />
              <Route path="jobs/:id/relatorio" element={<RelatorioAtendimentoPage />} />
              <Route path="notifications" element={<NotificacoesTecnicoPage />} />
              <Route path="sync" element={<SincronizacaoPage />} />
              <Route path="profile" element={<PerfilTecnicoPage />} />
              <Route path="*" element={<NaoEncontradoPage voltarPara="/technician" />} />
            </Route>
          </Routes>
        </SincronizacaoProvider>
      </GuardaTecnico>
    </TecnicoProvider>
  );
}
