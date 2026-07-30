"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [usuarioActivo, setUsuarioActivo] = useState<any>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  const [equipos, setEquipos] = useState<any[]>([]);
  const [todosLosTecnicos, setTodosLosTecnicos] = useState<any[]>([]);
  const [todosLosLideres, setTodosLosLideres] = useState<any[]>([]);
  
  const [equipoSeleccionado, setEquipoSeleccionado] = useState("");
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState("");
  const [tecnicosDelDia, setTecnicosDelDia] = useState<any[]>([]);

  const [fecha, setFecha] = useState("");
  const [archivos, setArchivos] = useState<any>({});
  const [guardando, setGuardando] = useState(false);

  const [equipoNoLaboro, setEquipoNoLaboro] = useState(false);
  const [liderDelDia, setLiderDelDia] = useState(""); 
  const [liderAsistencia, setLiderAsistencia] = useState("laboro");
  
  const [naAtsUnificado, setNaAtsUnificado] = useState(false);
  const [naPermisoElectrico, setNaPermisoElectrico] = useState(false);
  const [naPermisoAlturas, setNaPermisoAlturas] = useState(false);
  const [naAtsEntel, setNaAtsEntel] = useState(false);

  const [creandoNuevo, setCreandoNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoDni, setNuevoDni] = useState("");

  const [creandoTeam, setCreandoTeam] = useState(false);
  const [nuevoNombreTeam, setNuevoNombreTeam] = useState("");

  useEffect(() => {
    const sesion = localStorage.getItem("simecar_sesion");
    if (sesion) setUsuarioActivo(JSON.parse(sesion));
    setCargandoAuth(false);
  }, []);

  const iniciarSesion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLogin("");
    const { data } = await supabase.from("usuarios_sistema").select("*").eq("correo", correo).eq("password", password).single();
    if (data) {
      localStorage.setItem("simecar_sesion", JSON.stringify(data));
      setUsuarioActivo(data);
    } else {
      setErrorLogin("Credenciales incorrectas. Verifique su acceso.");
    }
  };

  const cerrarSesion = () => {
    localStorage.removeItem("simecar_sesion");
    setUsuarioActivo(null);
    setCorreo(""); setPassword("");
  };

  // 👇 AQUÍ ESTÁ EL CAMBIO CLAVE 👇
  const cargarDatos = async () => {
    // 1. Traemos los equipos igual que antes
    const { data: dataEquipos } = await supabase.from("equipos").select(`id, nombre_team, lider:trabajadoress!equipos_lider_id_fkey (id, nombres_apellidos, dni), equipo_tecnicos (tecnico:trabajadoress!equipo_tecnicos_tecnico_id_fkey (id, nombres_apellidos, dni))`);
    if (dataEquipos) setEquipos(dataEquipos);
    
    // 2. Traemos a TODOS los trabajadores sin importar el cargo, y los ordenamos alfabéticamente
    const { data: dataTodosLosTrabajadores } = await supabase
      .from("trabajadoress")
      .select("id, nombres_apellidos, dni")
      .order("nombres_apellidos", { ascending: true }); // Orden de la A a la Z
    
    if (dataTodosLosTrabajadores) {
      // 3. Le pasamos exactamente la misma lista completa y ordenada a ambos selectores
      setTodosLosTecnicos(dataTodosLosTrabajadores);
      setTodosLosLideres(dataTodosLosTrabajadores);
    }
  };
  // 👆 FIN DEL CAMBIO 👆

  useEffect(() => { if (usuarioActivo) cargarDatos(); }, [usuarioActivo]);

  useEffect(() => {
    const eq = equipos.find((e) => e.id === equipoSeleccionado);
    if (eq) {
      const tecnicosBase = eq.equipo_tecnicos ? eq.equipo_tecnicos.map((rel: any) => ({ id: rel.tecnico.id, asistencia: "laboro" })) : [];
      setTecnicosDelDia(tecnicosBase);
      setLiderDelDia(eq.lider?.id || ""); 
      setLiderAsistencia("laboro");
    } else {
      setTecnicosDelDia([]); setLiderDelDia("");
    }
  }, [equipoSeleccionado, equipos]);

  const agregarTecnico = () => setTecnicosDelDia([...tecnicosDelDia, { id: "", asistencia: "laboro" }]);
  const eliminarTecnico = (index: number) => { const nuevaLista = [...tecnicosDelDia]; nuevaLista.splice(index, 1); setTecnicosDelDia(nuevaLista); };
  const cambiarTecnico = (index: number, campo: string, valor: string) => { const nuevaLista = [...tecnicosDelDia]; nuevaLista[index][campo] = valor; setTecnicosDelDia(nuevaLista); };

  const guardarNuevoTecnicoBd = async () => {
    if (!nuevoNombre || !nuevoDni) return alert("Ingrese nombre y DNI.");
    const { data, error } = await supabase.from("trabajadoress").insert([{ nombres_apellidos: nuevoNombre, dni: nuevoDni, cargo: "Tecnico" }]).select();
    if (!error && data) {
      setTodosLosTecnicos([...todosLosTecnicos, data[0]]);
      // Agregamos esto para que el nuevo también aparezca en la lista de líderes si es necesario
      setTodosLosLideres([...todosLosLideres, data[0]]);
      setTecnicosDelDia([...tecnicosDelDia, { id: data[0].id, asistencia: "laboro" }]);
      setNuevoNombre(""); setNuevoDni(""); setCreandoNuevo(false);
    }
  };

  const guardarNuevoTeamBd = async () => {
    if (!nuevoNombreTeam) return alert("Ingrese el nombre del equipo.");
    const { data, error } = await supabase.from("equipos").insert([{ nombre_team: nuevoNombreTeam }]).select(`id, nombre_team, lider:trabajadoress!equipos_lider_id_fkey (id, nombres_apellidos, dni), equipo_tecnicos (tecnico:trabajadoress!equipo_tecnicos_tecnico_id_fkey (id, nombres_apellidos, dni))`);
    if (!error && data) {
      const nuevoEq = { ...data[0], equipo_tecnicos: data[0].equipo_tecnicos || [] };
      setEquipos([...equipos, nuevoEq]); setEquipoSeleccionado(nuevoEq.id); setCreandoTeam(false); setNuevoNombreTeam("");
    } else {
      alert("Error en el registro. Verifique si el equipo ya existe.");
    }
  };

  const manejarArchivo = (clave: string, archivo: File | undefined) => {
    if (archivo) { setArchivos({ ...archivos, [clave]: archivo }); } 
    else { const nuevosArchivos = { ...archivos }; delete nuevosArchivos[clave]; setArchivos(nuevosArchivos); }
  };

  const guardarRegistrosDelDia = async () => {
    if (!fecha || !proyectoSeleccionado || !equipoSeleccionado) return alert("Complete los campos obligatorios: Fecha, Operador y Team.");
    if (!equipoNoLaboro && !liderDelDia) return alert("Debe asignar un Team Leader para este registro.");
    if (!equipoNoLaboro && !archivos.fotoEpp) return alert("La evidencia fotográfica (EPP) es de carácter obligatorio.");

    setGuardando(true);
    try {
      let urlsSubidas: any = {};
      if (!equipoNoLaboro) {
        for (const clave in archivos) {
          const archivo = archivos[clave];
          const nombreUnico = `${Date.now()}_${archivo.name.replace(/\s/g, '_')}`;
          const { data, error: errorSubida } = await supabase.storage.from("registros_simecar").upload(`diarios/${nombreUnico}`, archivo);
          if (errorSubida) throw errorSubida;
          const { data: linkPublico } = supabase.storage.from("registros_simecar").getPublicUrl(data.path);
          urlsSubidas[clave] = linkPublico.publicUrl;
        }
      }

      const { data: registroInsertado, error: errorBD } = await supabase.from("registros_diarios").insert([{
        fecha: fecha, equipo_id: equipoSeleccionado, proyecto: proyectoSeleccionado, observaciones: equipoNoLaboro ? "EQUIPO NO LABORÓ EL DÍA DE HOY" : null,
        registro_1_url: urlsSubidas.registro1 || null, registro_2_url: urlsSubidas.registro2 || null, registro_3_url: urlsSubidas.registro3 || null, registro_4_url: urlsSubidas.registro4 || null, foto_epp_url: urlsSubidas.fotoEpp || null,
        ats_unificado_url: naAtsUnificado ? "N/A" : (urlsSubidas.atsUnificado || null),
        permiso_electrico_url: naPermisoElectrico ? "N/A" : (urlsSubidas.permisoElectrico || null),
        permiso_alturas_url: naPermisoAlturas ? "N/A" : (urlsSubidas.permisoAlturas || null),
        ats_entel_url: naAtsEntel ? "N/A" : (urlsSubidas.atsEntel || null),
        registrado_por: usuarioActivo.correo
      }]).select().single();

      if (errorBD) throw errorBD;
      const registroId = registroInsertado.id;

      let arrayAsistencia = [];
      if (liderDelDia) arrayAsistencia.push({ registro_diario_id: registroId, trabajador_id: liderDelDia, asistio: equipoNoLaboro ? false : (liderAsistencia === "laboro") });
      tecnicosDelDia.forEach(t => { if (t.id) arrayAsistencia.push({ registro_diario_id: registroId, trabajador_id: t.id, asistio: equipoNoLaboro ? false : (t.asistencia === "laboro") }); });

      const { error: errorAsistencia } = await supabase.from("asistencia_diaria").insert(arrayAsistencia);
      if (errorAsistencia) throw errorAsistencia;

      alert("Registro almacenado exitosamente en el servidor.");
      
      setArchivos({}); setFecha(""); setProyectoSeleccionado(""); setEquipoSeleccionado("");
      setEquipoNoLaboro(false); setNaAtsUnificado(false); setNaPermisoElectrico(false); 
      setNaPermisoAlturas(false); setNaAtsEntel(false); setLiderDelDia("");
      
    } catch (error) {
      console.error("Error:", error);
      alert("Falla de conexión al servidor. Contacte al administrador.");
    } finally {
      setGuardando(false);
    }
  };

  const detallesEquipo = equipos.find((eq) => eq.id === equipoSeleccionado);

  const docsObligatorios = [
    { key: "registro1", title: "Charla de 5 minutos" },
    { key: "registro2", title: "Check list de EPP" },
    { key: "registro3", title: "Check list de herramientas" },
    { key: "registro4", title: "Check list pre uso sistema contra caídas" }
  ];

  if (cargandoAuth) return <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">Validando credenciales...</div>;

  if (!usuarioActivo) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white max-w-md w-full p-8 rounded border border-slate-200 shadow-sm">
          <div className="text-center mb-8"><h1 className="text-3xl font-bold tracking-tight text-slate-900">Simecar</h1><p className="text-sm text-slate-500 mt-2">Portal de Gestión Operativa</p></div>
          <form onSubmit={iniciarSesion} className="space-y-6">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label><input type="email" required className="w-full p-3 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-600" value={correo} onChange={(e) => setCorreo(e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label><input type="password" required className="w-full p-3 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-600" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {errorLogin && <p className="text-red-600 text-sm font-medium">{errorLogin}</p>}
            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded transition-colors">Iniciar Sesión</button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white p-4 rounded shadow-sm border border-slate-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div><h1 className="text-2xl font-bold text-slate-900 tracking-tight">Registro de Documentación</h1><p className="text-sm text-slate-500">Módulo de Captura de Datos</p></div>
          <div className="flex items-center gap-4">
            <div className="text-right"><p className="text-xs text-slate-500 uppercase tracking-wider">Usuario Conectado</p><p className="text-sm font-medium text-slate-900">{usuarioActivo.correo} <span className="text-blue-600 font-bold ml-1">({usuarioActivo.rol})</span></p></div>
            <a href="/historial" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors">Módulo de Reportes</a>
            <button onClick={cerrarSesion} className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium py-2 px-4 rounded transition-colors">Cerrar Sesión</button>
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 p-5 bg-slate-50 rounded border border-slate-200">
            <div><label className="block text-xs font-bold text-slate-700 uppercase mb-2">Fecha Operativa</label><input type="date" className="w-full p-2.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500" value={fecha} onChange={(e) => setFecha(e.target.value)} /></div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Operador / Cliente</label>
              <select className="w-full p-2.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500" value={proyectoSeleccionado} onChange={(e) => setProyectoSeleccionado(e.target.value)}>
                <option value="">Seleccionar Operador</option><option value="Claro">Claro</option><option value="Integratel">Integratel</option><option value="Bitel">Bitel</option><option value="Entel">Entel</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Cuadrilla / Team</label>
              <div className="flex gap-2">
                {!creandoTeam ? (
                  <><select className="w-full p-2.5 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500" value={equipoSeleccionado} onChange={(e) => setEquipoSeleccionado(e.target.value)}>
                      <option value="">Seleccionar Team</option>
                      {[...equipos].sort((a,b) => a.nombre_team.localeCompare(b.nombre_team, undefined, {numeric: true})).map((equipo) => (<option key={equipo.id} value={equipo.id}>{equipo.nombre_team}</option>))}
                    </select>
                    <button onClick={() => setCreandoTeam(true)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium px-3 py-2 rounded text-sm whitespace-nowrap">Nuevo</button>
                  </>
                ) : (
                  <><input type="text" className="w-full p-2.5 border border-slate-300 rounded text-sm" placeholder="Ej. Team 31" value={nuevoNombreTeam} onChange={(e) => setNuevoNombreTeam(e.target.value)} />
                    <button onClick={guardarNuevoTeamBd} className="bg-slate-800 hover:bg-slate-900 text-white font-medium px-3 py-2 rounded text-sm">Guardar</button>
                    <button onClick={() => setCreandoTeam(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium px-3 py-2 rounded text-sm">X</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {!detallesEquipo && <div className="text-center py-12 text-slate-500 border border-dashed border-slate-300 rounded bg-slate-50 text-sm">Seleccione Fecha, Operador y Cuadrilla para habilitar los campos de registro.</div>}

          {detallesEquipo && (
            <div className="space-y-8">
              <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-5">
                  <h2 className="text-lg font-semibold text-slate-800">Personal Operativo: {detallesEquipo.nombre_team}</h2>
                  <label className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded cursor-pointer font-medium text-sm hover:bg-red-100">
                    <input type="checkbox" className="w-4 h-4 accent-red-600" checked={equipoNoLaboro} onChange={(e) => setEquipoNoLaboro(e.target.checked)} /> Registrar Inasistencia General
                  </label>
                </div>
                
                <div className={`p-4 rounded border mb-4 flex flex-col md:flex-row justify-between items-center gap-4 ${equipoNoLaboro ? 'bg-slate-100 opacity-60' : 'bg-white shadow-sm'}`}>
                  <div className="flex items-center w-full md:w-2/3">
                    <span className={`text-white text-xs font-bold px-2 py-1 rounded uppercase mr-3 ${equipoNoLaboro ? 'bg-slate-400' : 'bg-slate-800'}`}>Leader</span>
                    <select className="w-full p-2.5 border border-slate-300 rounded text-sm font-medium" value={liderDelDia} onChange={(e) => setLiderDelDia(e.target.value)} disabled={equipoNoLaboro}>
                      <option value="">-- Asignar Responsable --</option>{todosLosLideres.map(l => <option key={l.id} value={l.id}>{l.nombres_apellidos}</option>)}
                    </select>
                  </div>
                  <select className="p-2.5 border border-slate-300 rounded text-sm" value={equipoNoLaboro ? "no_laboro" : liderAsistencia} onChange={(e) => setLiderAsistencia(e.target.value)} disabled={equipoNoLaboro}>
                    <option value="laboro">Asistió</option><option value="no_laboro">Inasistencia</option>
                  </select>
                </div>

                <div className={`p-5 rounded border ${equipoNoLaboro ? 'bg-slate-100 opacity-60' : 'bg-slate-50'}`}>
                  <div className="flex justify-between items-center mb-4"><h3 className="font-semibold text-slate-700 text-sm uppercase">Técnicos Asignados</h3>
                    {!equipoNoLaboro && (
                      <div className="flex gap-2"><button onClick={agregarTecnico} className="text-xs bg-white border border-slate-300 py-1.5 px-3 rounded shadow-sm">Añadir Técnico</button><button onClick={() => setCreandoNuevo(!creandoNuevo)} className="text-xs bg-slate-800 text-white py-1.5 px-3 rounded shadow-sm">Nuevo Personal</button></div>
                    )}
                  </div>
                  {creandoNuevo && !equipoNoLaboro && (
                    <div className="mb-5 p-4 bg-white border rounded flex flex-col md:flex-row gap-3 items-end shadow-sm">
                      <div className="w-full md:w-1/2"><label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label><input type="text" className="w-full p-2 border rounded text-sm" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} /></div>
                      <div className="w-full md:w-1/3"><label className="block text-xs font-medium text-slate-600 mb-1">DNI</label><input type="text" className="w-full p-2 border rounded text-sm" value={nuevoDni} onChange={(e) => setNuevoDni(e.target.value)} /></div>
                      <button onClick={guardarNuevoTecnicoBd} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Guardar</button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {tecnicosDelDia.map((tecnico, index) => (
                      <div key={index} className="flex flex-col md:flex-row justify-between items-center p-3 bg-white border rounded shadow-sm gap-3">
                        <select className="w-full md:w-2/3 p-2 border rounded text-sm" value={tecnico.id} onChange={(e) => cambiarTecnico(index, "id", e.target.value)} disabled={equipoNoLaboro}>
                          <option value="">-- Seleccionar Técnico --</option>{todosLosTecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombres_apellidos}</option>)}
                        </select>
                        <div className="flex gap-2 items-center">
                          <select className="p-2 border rounded text-sm" value={equipoNoLaboro ? "no_laboro" : tecnico.asistencia} onChange={(e) => cambiarTecnico(index, "asistencia", e.target.value)} disabled={equipoNoLaboro}>
                            <option value="laboro">Asistió</option><option value="no_laboro">Inasistencia</option>
                          </select>
                          {!equipoNoLaboro && <button onClick={() => eliminarTecnico(index)} className="p-2 text-red-400 hover:text-red-600">✕</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {!equipoNoLaboro ? (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-3 mb-5">Repositorio Documental</h2>
                  
                  <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">Documentos Obligatorios</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                    {docsObligatorios.map((doc) => (
                      <div key={doc.key} className="bg-white p-4 rounded border border-slate-300 shadow-sm">
                        <label className="block text-sm font-medium text-slate-700 mb-2">{doc.title}</label>
                        <input type="file" className="text-sm w-full text-slate-600 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100" onChange={(e) => manejarArchivo(doc.key, e.target.files?.[0])} />
                      </div>
                    ))}
                    <div className="bg-white p-4 rounded border border-blue-200 shadow-sm md:col-span-2 border-l-4 border-l-blue-600">
                      <label className="block text-sm font-medium text-slate-900 mb-2">Foto con EPPs (Equipo)</label>
                      <input type="file" accept="image/*" className="text-sm w-full text-slate-600 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 text-blue-700" onChange={(e) => manejarArchivo("fotoEpp", e.target.files?.[0])} />
                    </div>
                  </div>

                  {(proyectoSeleccionado === "Claro" || proyectoSeleccionado === "Integratel" || proyectoSeleccionado === "Bitel") && (
                    <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded">
                      <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">Documentación Específica: {proyectoSeleccionado}</h3>
                      <div className="bg-white p-4 rounded border border-slate-300 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                          <label className={`block text-sm font-medium ${naAtsUnificado ? 'text-slate-400 line-through' : 'text-slate-700'}`}>ATS Unificado</label>
                          <label className="text-xs flex items-center gap-2 font-medium text-slate-600 cursor-pointer bg-slate-100 px-2 py-1 rounded">
                            <input type="checkbox" className="w-3.5 h-3.5" checked={naAtsUnificado} onChange={(e) => setNaAtsUnificado(e.target.checked)} /> N/A
                          </label>
                        </div>
                        {!naAtsUnificado && <input type="file" className="text-sm w-full text-slate-600 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 mt-2" onChange={(e) => manejarArchivo("atsUnificado", e.target.files?.[0])}/>}
                      </div>
                    </div>
                  )}

                  {proyectoSeleccionado === "Entel" && (
                    <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded">
                      <h3 className="font-semibold text-slate-700 mb-4 text-sm uppercase tracking-wide">Documentación Específica: Entel</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white p-4 rounded border shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                              <label className={`block text-sm font-medium ${naPermisoElectrico ? 'text-slate-400 line-through' : 'text-slate-700'}`}>Permiso de trabajo eléctrico</label>
                              <label className="text-xs flex items-center gap-1 font-medium cursor-pointer"><input type="checkbox" checked={naPermisoElectrico} onChange={(e) => setNaPermisoElectrico(e.target.checked)} /> N/A</label>
                            </div>
                            {!naPermisoElectrico && <input type="file" className="text-sm w-full text-slate-600 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-100 mt-2" onChange={(e) => manejarArchivo("permisoElectrico", e.target.files?.[0])}/>}
                        </div>
                        <div className="bg-white p-4 rounded border shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                              <label className={`block text-sm font-medium ${naPermisoAlturas ? 'text-slate-400 line-through' : 'text-slate-700'}`}>Permiso de trabajo de altura</label>
                              <label className="text-xs flex items-center gap-1 font-medium cursor-pointer"><input type="checkbox" checked={naPermisoAlturas} onChange={(e) => setNaPermisoAlturas(e.target.checked)} /> N/A</label>
                            </div>
                            {!naPermisoAlturas && <input type="file" className="text-sm w-full text-slate-600 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-100 mt-2" onChange={(e) => manejarArchivo("permisoAlturas", e.target.files?.[0])}/>}
                        </div>
                        <div className="bg-white p-4 rounded border shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                              <label className={`block text-sm font-medium ${naAtsEntel ? 'text-slate-400 line-through' : 'text-slate-700'}`}>ATS Entel</label>
                              <label className="text-xs flex items-center gap-1 font-medium cursor-pointer"><input type="checkbox" checked={naAtsEntel} onChange={(e) => setNaAtsEntel(e.target.checked)} /> N/A</label>
                            </div>
                            {!naAtsEntel && <input type="file" className="text-sm w-full text-slate-600 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-100 mt-2" onChange={(e) => manejarArchivo("atsEntel", e.target.files?.[0])}/>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white border-l-4 border-red-600 p-6 rounded shadow-sm mt-8"><h3 className="text-lg font-semibold text-slate-800">Inasistencia Registrada</h3><p className="text-slate-600 mt-1 text-sm">Al guardar la información, el sistema registrará la inasistencia total de la cuadrilla y eximirá la carga documental.</p></div>
              )}

              <div className="mt-8 flex justify-end border-t border-slate-200 pt-6">
                <button onClick={guardarRegistrosDelDia} disabled={guardando} className={`font-medium py-3 px-8 rounded shadow-sm ${guardando ? "bg-slate-300 cursor-not-allowed text-slate-500" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                  {guardando ? "Procesando Registro..." : "Procesar y Guardar Registro"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
