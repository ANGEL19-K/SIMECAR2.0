"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Historial() {
  const [usuarioActivo, setUsuarioActivo] = useState<any>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [registros, setRegistros] = useState<any[]>([]);
  const [equipos, setEquipos] = useState<any[]>([]);
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [cargando, setCargando] = useState(true);

  const [registroEditando, setRegistroEditando] = useState<any>(null);
  const [editFecha, setEditFecha] = useState("");
  const [editOperador, setEditOperador] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  useEffect(() => {
    const sesion = localStorage.getItem("simecar_sesion");
    if (sesion) setUsuarioActivo(JSON.parse(sesion)); else window.location.href = "/";
    setCargandoAuth(false);
  }, []);

  const cargarHistorial = async () => {
    setCargando(true);
    const { data: dataRegistros } = await supabase.from("registros_diarios").select(`*, equipo:equipos (nombre_team)`).order("fecha", { ascending: false });
    if (dataRegistros) setRegistros(dataRegistros);
    const { data: dataEquipos } = await supabase.from("equipos").select("id, nombre_team");
    if (dataEquipos) setEquipos(dataEquipos);
    setCargando(false);
  };

  useEffect(() => { if (usuarioActivo) cargarHistorial(); }, [usuarioActivo]);

  const eliminarRegistro = async (id: string) => {
    const confirmacion = window.confirm("¿Está seguro de que desea eliminar este registro permanentemente?");
    if (confirmacion) {
      const { error } = await supabase.from("registros_diarios").delete().eq("id", id);
      if (!error) setRegistros(registros.filter(r => r.id !== id));
    }
  };

  const abrirModalEdicion = (reg: any) => { setRegistroEditando(reg); setEditFecha(reg.fecha); setEditOperador(reg.proyecto); };
  const guardarEdicion = async () => {
    setGuardandoEdicion(true);
    const { error } = await supabase.from("registros_diarios").update({ fecha: editFecha, proyecto: editOperador }).eq("id", registroEditando.id);
    if (!error) { setRegistros(registros.map(r => r.id === registroEditando.id ? { ...r, fecha: editFecha, proyecto: editOperador } : r)); setRegistroEditando(null); }
    setGuardandoEdicion(false);
  };

  // AQUÍ ESTÁN LOS TÍTULOS OFICIALES PARA EL EXCEL
  const exportarExcel = (tipo: "general" | "por_equipo") => {
    if (tipo === "por_equipo" && !filtroEquipo) return alert("Seleccione una cuadrilla en el filtro.");
    let datosAExportar = registros;
    if (tipo === "por_equipo") {
      datosAExportar = registros.filter(r => r.equipo_id === filtroEquipo);
      if (datosAExportar.length === 0) return alert("No existen registros operativos.");
    }

    const datosMapeados = datosAExportar.map(reg => ({
      'Fecha Operativa': reg.fecha,
      'Operador': reg.proyecto,
      'Cuadrilla': reg.equipo?.nombre_team || 'No Asignado',
      'Asistencia': reg.observaciones === 'EQUIPO NO LABORÓ EL DÍA DE HOY' ? 'INASISTENCIA' : 'LABORÓ',
      'Charla de 5 minutos': reg.registro_1_url ? 'Entregado' : 'Falta',
      'Check list de EPP': reg.registro_2_url ? 'Entregado' : 'Falta',
      'Check list de herramientas': reg.registro_3_url ? 'Entregado' : 'Falta',
      'Check list pre uso Sist. Contra caídas': reg.registro_4_url ? 'Entregado' : 'Falta',
      'Foto con EPPs': reg.foto_epp_url ? 'Entregado' : 'Falta',
      'ATS Unificado (Claro/Inte/Bitel)': reg.ats_unificado_url === 'N/A' ? 'N/A' : (reg.ats_unificado_url ? 'Entregado' : 'Falta'),
      'Permiso de trabajo eléctrico (Entel)': reg.permiso_electrico_url === 'N/A' ? 'N/A' : (reg.permiso_electrico_url ? 'Entregado' : 'Falta'),
      'Permiso de trabajo de altura (Entel)': reg.permiso_alturas_url === 'N/A' ? 'N/A' : (reg.permiso_alturas_url ? 'Entregado' : 'Falta'),
      'ATS Entel': reg.ats_entel_url === 'N/A' ? 'N/A' : (reg.ats_entel_url ? 'Entregado' : 'Falta')
    }));

    const hoja = XLSX.utils.json_to_sheet(datosMapeados);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte Simecar");
    const nombreEquipo = tipo === "por_equipo" ? equipos.find(e => e.id === filtroEquipo)?.nombre_team.replace(/\s/g, '_') : "General";
    XLSX.writeFile(libro, `Simecar_Reporte_${nombreEquipo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const registrosMostrados = filtroEquipo ? registros.filter(r => r.equipo_id === filtroEquipo) : registros;
  const totalRegistros = registrosMostrados.length;
  const inasistencias = registrosMostrados.filter(r => r.observaciones === 'EQUIPO NO LABORÓ EL DÍA DE HOY').length;
  const operativos = totalRegistros - inasistencias;
  const datosPastel = [ { name: 'Operativos', value: operativos, color: '#16a34a' }, { name: 'Inasistencias', value: inasistencias, color: '#dc2626' } ];
  const conteoPorTeam = registrosMostrados.reduce((acc: any, reg: any) => { const nombre = reg.equipo?.nombre_team || 'Sin Team'; if (!acc[nombre]) acc[nombre] = 0; acc[nombre] += 1; return acc; }, {});
  const datosBarras = Object.keys(conteoPorTeam).map(key => ({ nombre: key, operaciones: conteoPorTeam[key] })).sort((a, b) => b.operaciones - a.operaciones);

  if (cargandoAuth || !usuarioActivo) return <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">Validando accesos...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800 relative">
      <div className="max-w-7xl mx-auto">
        
        <div className="bg-white p-4 rounded shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-slate-900">Historial Analítico</h1></div>
          <div className="flex items-center gap-4">
            <div className="text-right"><p className="text-xs text-slate-500 uppercase">Usuario Conectado</p><p className="text-sm font-medium">{usuarioActivo.correo} <span className="text-blue-600 font-bold ml-1">({usuarioActivo.rol})</span></p></div>
            <a href="/" className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded text-sm font-medium">Volver al Panel</a>
          </div>
        </div>

        {!cargando && totalRegistros > 0 && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-4">
              <div className="bg-white p-5 rounded border shadow-sm flex justify-between items-center border-l-4 border-l-blue-600">
                <div><p className="text-xs font-bold text-slate-500 uppercase">Total Registros</p><p className="text-3xl font-black mt-1">{totalRegistros}</p></div><div className="text-blue-500 text-3xl">📋</div>
              </div>
              <div className="bg-white p-5 rounded border shadow-sm flex justify-between items-center border-l-4 border-l-green-500">
                <div><p className="text-xs font-bold text-slate-500 uppercase">Días Operativos</p><p className="text-3xl font-black mt-1">{operativos}</p></div><div className="text-green-500 text-3xl">✅</div>
              </div>
              <div className="bg-white p-5 rounded border shadow-sm flex justify-between items-center border-l-4 border-l-red-500">
                <div><p className="text-xs font-bold text-slate-500 uppercase">Inasistencias</p><p className="text-3xl font-black mt-1">{inasistencias}</p></div><div className="text-red-500 text-3xl">❌</div>
              </div>
            </div>
            <div className="bg-white p-5 rounded border shadow-sm flex flex-col items-center justify-center">
              <h3 className="text-sm font-bold text-slate-600 uppercase mb-2">Tasa de Operatividad</h3>
              <div className="w-full h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={datosPastel} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={5}>{datosPastel.map((entry, i) => <Cell key={i} fill={entry.color} />)}</Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-5 rounded border shadow-sm flex flex-col items-center justify-center">
              <h3 className="text-sm font-bold text-slate-600 uppercase mb-2">Registros por Team</h3>
              <div className="w-full h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosBarras}><XAxis dataKey="nombre" tick={{fontSize: 10}} interval={0} angle={-45} textAnchor="end" height={50} /><Tooltip cursor={{fill: '#f1f5f9'}} /><Bar dataKey="operaciones" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-5 rounded shadow-sm border mb-6 flex justify-between items-center">
          <div className="flex items-center gap-3"><label className="text-sm font-semibold">Filtrar Cuadrilla:</label>
            <select className="p-2 border rounded text-sm focus:outline-none" value={filtroEquipo} onChange={(e) => setFiltroEquipo(e.target.value)}>
              <option value="">Todos los Registros</option>{[...equipos].sort((a,b) => a.nombre_team.localeCompare(b.nombre_team, undefined, {numeric: true})).map(eq => <option key={eq.id} value={eq.id}>{eq.nombre_team}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={() => exportarExcel("por_equipo")} className="bg-green-600 text-white px-4 py-2 rounded shadow-sm text-sm font-medium">Excel (Selección)</button>
            <button onClick={() => exportarExcel("general")} className="bg-slate-800 text-white px-4 py-2 rounded shadow-sm text-sm font-medium">Excel (General)</button>
          </div>
        </div>

        {cargando ? ( <div className="bg-white p-10 rounded text-center text-slate-500">Cargando base de datos...</div> ) : (
          <div className="bg-white rounded shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-100 border-b text-slate-700">
                  <tr>
                    <th className="p-4 font-semibold">Fecha</th>
                    <th className="p-4 font-semibold">Cuadrilla</th>
                    <th className="p-4 font-semibold">Operador</th>
                    <th className="p-4 font-semibold">Estatus</th>
                    <th className="p-4 font-semibold">Docs Obligatorios</th>
                    <th className="p-4 font-semibold">Específicos</th>
                    {usuarioActivo?.rol === 'Admin' && <th className="p-4 font-semibold text-center">Gestión</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {registrosMostrados.length === 0 ? ( <tr><td colSpan={7} className="p-8 text-center text-slate-500">No hay registros en el sistema.</td></tr> ) : (
                    registrosMostrados.map((reg) => (
                      <tr key={reg.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium">{reg.fecha}</td><td className="p-4">{reg.equipo?.nombre_team}</td><td className="p-4"><span className="bg-slate-200 px-2 py-1 rounded text-xs font-semibold">{reg.proyecto}</span></td>
                        <td className="p-4">{reg.observaciones === 'EQUIPO NO LABORÓ EL DÍA DE HOY' ? <span className="text-red-600 font-semibold bg-red-50 px-2 py-1 rounded text-xs">INASISTENCIA</span> : <span className="text-green-600 font-semibold bg-green-50 px-2 py-1 rounded text-xs">OPERATIVO</span>}</td>
                        <td className="p-4 flex gap-2">
                          {/* Abreviaturas en los botones para que la tabla no se deforme */}
                          {[
                            { url: reg.registro_1_url, label: "CH-5M", title: "Charla de 5 minutos" },
                            { url: reg.registro_2_url, label: "CK-EPP", title: "Check list de EPP" },
                            { url: reg.registro_3_url, label: "CK-HER", title: "Check list de herramientas" },
                            { url: reg.registro_4_url, label: "CK-CAI", title: "Check list contra caídas" },
                            { url: reg.foto_epp_url, label: "F-EPP", title: "Foto EPPs" }
                          ].map((doc, i) => (
                            doc.url ? <a key={i} href={doc.url} target="_blank" className="text-xs bg-slate-100 border px-2 py-1.5 rounded font-medium text-slate-700 hover:bg-slate-200" title={doc.title}>{doc.label}</a> : <span key={i} className="text-xs bg-red-50 border border-red-100 px-2 py-1.5 rounded text-red-400 line-through" title={`Falta: ${doc.title}`}>{doc.label}</span>
                          ))}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            {['Claro', 'Integratel', 'Bitel'].includes(reg.proyecto) && (
                              reg.ats_unificado_url === 'N/A' ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">ATS: N/A</span> : reg.ats_unificado_url ? <a href={reg.ats_unificado_url} target="_blank" className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1.5 rounded font-medium">ATS Unif.</a> : <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">Falta ATS</span>
                            )}
                            {reg.proyecto === 'Entel' && (
                              <>
                                {reg.permiso_electrico_url === 'N/A' ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">Eléc: N/A</span> : reg.permiso_electrico_url ? <a href={reg.permiso_electrico_url} target="_blank" className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded font-medium">P. Eléctrico</a> : <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">Falta PE</span>}
                                {reg.permiso_alturas_url === 'N/A' ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">Alt: N/A</span> : reg.permiso_alturas_url ? <a href={reg.permiso_alturas_url} target="_blank" className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded font-medium">P. Alturas</a> : <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">Falta PA</span>}
                                {reg.ats_entel_url === 'N/A' ? <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">ATS: N/A</span> : reg.ats_entel_url ? <a href={reg.ats_entel_url} target="_blank" className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1.5 rounded font-medium">ATS Entel</a> : <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">Falta ATS</span>}
                              </>
                            )}
                          </div>
                        </td>
                        {usuarioActivo?.rol === 'Admin' && (
                          <td className="p-4 text-center">
                            <div className="flex gap-2 justify-center">
                              <button onClick={() => abrirModalEdicion(reg)} className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-1.5 px-3 rounded border border-blue-200">Editar</button>
                              <button onClick={() => eliminarRegistro(reg.id)} className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-1.5 px-3 rounded border border-red-200">Eliminar</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {registroEditando && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Editar Registro</h2>
            <div className="mb-4"><label className="block text-sm font-medium mb-1">Fecha Operativa</label><input type="date" className="w-full p-2 border rounded text-sm" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} /></div>
            <div className="mb-6"><label className="block text-sm font-medium mb-1">Operador</label><select className="w-full p-2 border rounded text-sm" value={editOperador} onChange={(e) => setEditOperador(e.target.value)}><option value="Claro">Claro</option><option value="Integratel">Integratel</option><option value="Bitel">Bitel</option><option value="Entel">Entel</option></select></div>
            <div className="flex justify-end gap-3"><button onClick={() => setRegistroEditando(null)} className="bg-slate-200 px-4 py-2 rounded text-sm font-medium">Cancelar</button><button onClick={guardarEdicion} disabled={guardandoEdicion} className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium disabled:bg-slate-400">{guardandoEdicion ? "Guardando..." : "Guardar"}</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
