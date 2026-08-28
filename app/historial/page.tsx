"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const STORAGE_BUCKET = "registros_simecar";

const DOCUMENTOS_OBLIGATORIOS = [
  { campo: "registro_1_url", etiqueta: "Charla de 5 minutos" },
  { campo: "registro_2_url", etiqueta: "Check list de EPP" },
  { campo: "registro_3_url", etiqueta: "Check list de herramientas" },
  { campo: "registro_4_url", etiqueta: "Check list contra caídas" },
  { campo: "foto_epp_url", etiqueta: "Foto con EPPs" },
] as const;

const DOCUMENTOS_ESPECIFICOS = [
  { campo: "ats_unificado_url", etiqueta: "ATS Unificado" },
  { campo: "permiso_electrico_url", etiqueta: "Permiso de trabajo eléctrico" },
  { campo: "permiso_alturas_url", etiqueta: "Permiso de trabajo en altura" },
  { campo: "ats_entel_url", etiqueta: "ATS Entel" },
] as const;

const CAMPOS_DOCUMENTOS = [
  ...DOCUMENTOS_OBLIGATORIOS.map((doc) => doc.campo),
  ...DOCUMENTOS_ESPECIFICOS.map((doc) => doc.campo),
] as const;

type CampoDocumento = (typeof CAMPOS_DOCUMENTOS)[number];

export default function Historial() {
  const [usuarioActivo, setUsuarioActivo] = useState<any>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);

  const [registros, setRegistros] = useState<any[]>([]);
  const [equipos, setEquipos] = useState<any[]>([]);
  const [filtroEquipo, setFiltroEquipo] = useState("");
  const [cargando, setCargando] = useState(true);

  const [registroEditando, setRegistroEditando] = useState<any>(null);
  const [editFecha, setEditFecha] = useState("");
  const [editHora, setEditHora] = useState("");
  const [editOperador, setEditOperador] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  
  const [archivosEdicion, setArchivosEdicion] = useState<
    Partial<Record<CampoDocumento, File>>
  >({});

  const [documentosEliminados, setDocumentosEliminados] = useState<
    Partial<Record<CampoDocumento, boolean>>
  >({});

  useEffect(() => {
    const sesion = localStorage.getItem("simecar_sesion");
    if (sesion) {
      setUsuarioActivo(JSON.parse(sesion));
    } else {
      window.location.href = "/";
    }
    setCargandoAuth(false);
  }, []);

  const cargarHistorial = async () => {
    setCargando(true);

    try {
      const { data: dataEquipos, error: errorEquipos } = await supabase
        .from("equipos")
        .select("id, nombre_team, lider_id");

      if (errorEquipos) {
        throw errorEquipos;
      }

      const equiposCargados = dataEquipos || [];
      setEquipos(equiposCargados);

      const { data: dataRegistros, error: errorRegistros } = await supabase
        .from("registros_diarios")
        .select(`*, equipo:equipos (nombre_team)`)
        .order("fecha", { ascending: false });

      if (errorRegistros) {
        throw errorRegistros;
      }

      const registrosBase = dataRegistros || [];

      if (registrosBase.length === 0) {
        setRegistros([]);
        return;
      }

      const idsRegistros = registrosBase.map((reg: any) => reg.id);

      let asistencias: any[] = [];

      // Primero intentamos leer rol_registro. Si aún no existe la columna,
      // el historial sigue funcionando y usa el líder actual del Team como respaldo.
      const consultaAsistencias = await supabase
        .from("asistencia_diaria")
        .select("registro_diario_id, trabajador_id, asistio, rol_registro")
        .in("registro_diario_id", idsRegistros);

      if (consultaAsistencias.error) {
        console.warn(
          "No se pudo leer rol_registro. Se usará compatibilidad con registros antiguos:",
          consultaAsistencias.error
        );

        const consultaAntigua = await supabase
          .from("asistencia_diaria")
          .select("registro_diario_id, trabajador_id, asistio")
          .in("registro_diario_id", idsRegistros);

        if (consultaAntigua.error) {
          throw consultaAntigua.error;
        }

        asistencias = (consultaAntigua.data || []).map((a: any) => ({
          ...a,
          rol_registro: null,
        }));
      } else {
        asistencias = consultaAsistencias.data || [];
      }

      const idsTrabajadores = [
        ...new Set(
          asistencias
            .map((a: any) => a.trabajador_id)
            .filter((id: any) => Boolean(id))
        ),
      ];

      let nombresPorId: Record<string, string> = {};

      if (idsTrabajadores.length > 0) {
        const { data: trabajadores, error: errorTrabajadores } = await supabase
          .from("trabajadoress")
          .select("id, nombres_apellidos")
          .in("id", idsTrabajadores);

        if (errorTrabajadores) {
          throw errorTrabajadores;
        }

        nombresPorId = Object.fromEntries(
          (trabajadores || []).map((t: any) => [t.id, t.nombres_apellidos])
        );
      }

      const equiposPorId = Object.fromEntries(
        equiposCargados.map((eq: any) => [eq.id, eq])
      );

      const registrosConPersonal = registrosBase.map((reg: any) => {
        const personal = asistencias.filter(
          (a: any) => a.registro_diario_id === reg.id
        );

        const equipoActual = equiposPorId[reg.equipo_id];
        const liderActualId = equipoActual?.lider_id || null;

        const esLeader = (persona: any) => {
          const rol = String(persona.rol_registro || "").toUpperCase();

          if (rol === "LEADER") return true;
          if (rol === "TECNICO") return false;

          // Compatibilidad con registros creados antes de rol_registro.
          return Boolean(liderActualId && persona.trabajador_id === liderActualId);
        };

        const leaders = personal
          .filter(esLeader)
          .map((p: any) => nombresPorId[p.trabajador_id])
          .filter(Boolean);

        const tecnicos = personal
          .filter((p: any) => !esLeader(p))
          .map((p: any) => nombresPorId[p.trabajador_id])
          .filter(Boolean);

        return {
          ...reg,
          team_leader: leaders.join(", "),
          tecnicos_registrados: tecnicos.join(", "),
        };
      });

      setRegistros(registrosConPersonal);
    } catch (error) {
      console.error(error);
      alert("No se pudo cargar el historial y el personal registrado.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (usuarioActivo) cargarHistorial();
  }, [usuarioActivo]);

  const eliminarRegistro = async (reg: any) => {
    const confirmacion = window.confirm(
      "¿Está seguro? Se eliminará el registro y todos sus documentos permanentemente."
    );

    if (!confirmacion) return;

    try {

      const rutasArchivos = CAMPOS_DOCUMENTOS
        .map((campo) => obtenerRutaStorage(reg[campo]))
        .filter((ruta): ruta is string => Boolean(ruta));


      if (rutasArchivos.length > 0) {
        const rutasSinRepetir = [...new Set(rutasArchivos)];

        const { error: errorStorage } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(rutasSinRepetir);

        if (errorStorage) {
          throw new Error(
            `No se pudieron eliminar los archivos del Storage: ${errorStorage.message}`
          );
        }
      }

      const { error: errorRegistro } = await supabase
        .from("registros_diarios")
        .delete()
        .eq("id", reg.id);

      if (errorRegistro) {
        throw new Error(
          `Los archivos se eliminaron, pero no se pudo borrar la fila: ${errorRegistro.message}`
        );
      }

      setRegistros((actuales) =>
        actuales.filter((registro) => registro.id !== reg.id)
      );

      alert("Registro y documentos eliminados permanentemente.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "No se pudo eliminar el registro.");
    }
  };

  const abrirModalEdicion = (reg: any) => {
    setRegistroEditando(reg);
    setEditFecha(reg.fecha);
    setEditHora(reg.hora_epp ? String(reg.hora_epp).slice(0, 5) : "");
    setEditOperador(reg.proyecto);
    setArchivosEdicion({});
    setDocumentosEliminados({});
  };

  const cerrarModalEdicion = () => {
    if (guardandoEdicion) return;
    setRegistroEditando(null);
    setArchivosEdicion({});
    setDocumentosEliminados({});
  };

  const limpiarNombreArchivo = (nombre: string) => {
    return nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");
  };

  const subirDocumento = async (
    campo: CampoDocumento,
    archivo: File,
    registroId: string
  ) => {
    const nombreSeguro = limpiarNombreArchivo(archivo.name);
    const ruta = `diarios/${registroId}/${campo}/${Date.now()}-${nombreSeguro}`;

    const { error: errorSubida } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(ruta, archivo, {
        cacheControl: "3600",
        upsert: false,
        contentType: archivo.type || undefined,
      });

    if (errorSubida) {
      throw new Error(
        `No se pudo subir "${archivo.name}": ${errorSubida.message}`
      );
    }

    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(ruta);

    if (!data.publicUrl) {
      throw new Error(`No se pudo generar la URL de "${archivo.name}".`);
    }

    return {
      url: data.publicUrl,
      ruta,
    };
  };


  const obtenerRutaStorage = (url: unknown) => {
    if (typeof url !== "string" || !url || url === "N/A") return null;

    try {
      const urlObjeto = new URL(url);
      const marcador = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
      const posicion = urlObjeto.pathname.indexOf(marcador);

      if (posicion === -1) return null;

      return decodeURIComponent(
        urlObjeto.pathname.substring(posicion + marcador.length)
      );
    } catch {
      return null;
    }
  };

  const formatearHora = (hora: any) => {
    if (!hora) return "";
    return String(hora).slice(0, 5);
  };

  const guardarEdicion = async () => {
    if (!registroEditando) return;

    if (!editFecha) {
      alert("Seleccione la fecha operativa.");
      return;
    }

    setGuardandoEdicion(true);

    const rutasNuevas: string[] = [];
    const rutasAntiguas: string[] = [];

    try {
      const cambios: Record<string, any> = {
        fecha: editFecha,
        hora_epp: editHora || null,
        proyecto: editOperador,
      };

      const camposEspecificosActivos = new Set<CampoDocumento>(
        editOperador === "Entel"
          ? [
              "permiso_electrico_url",
              "permiso_alturas_url",
              "ats_entel_url",
            ]
          : ["ats_unificado_url"]
      );

      const camposEspecificos = new Set<CampoDocumento>(
        DOCUMENTOS_ESPECIFICOS.map((doc) => doc.campo)
      );

      for (const campo of CAMPOS_DOCUMENTOS) {
        const valorActual = registroEditando[campo];
        const archivoNuevo = archivosEdicion[campo];
        const eliminarActual = Boolean(documentosEliminados[campo]);
        const esEspecifico = camposEspecificos.has(campo);
        const aplicaAlOperador =
          !esEspecifico || camposEspecificosActivos.has(campo);

        if (!aplicaAlOperador) {
          const rutaAnterior = obtenerRutaStorage(valorActual);
          if (rutaAnterior) rutasAntiguas.push(rutaAnterior);
          cambios[campo] = "N/A";
          continue;
        }

        if (archivoNuevo) {
          const subida = await subirDocumento(
            campo,
            archivoNuevo,
            String(registroEditando.id)
          );

          rutasNuevas.push(subida.ruta);
          cambios[campo] = subida.url;

          const rutaAnterior = obtenerRutaStorage(valorActual);
          if (rutaAnterior) rutasAntiguas.push(rutaAnterior);
          continue;
        }

        if (eliminarActual) {
          cambios[campo] = null;

          const rutaAnterior = obtenerRutaStorage(valorActual);
          if (rutaAnterior) rutasAntiguas.push(rutaAnterior);
          continue;
        }


        if (esEspecifico && valorActual === "N/A") {
          cambios[campo] = null;
        }
      }

      const { error: errorActualizacion } = await supabase
        .from("registros_diarios")
        .update(cambios)
        .eq("id", registroEditando.id);

      if (errorActualizacion) {
        throw new Error(errorActualizacion.message);
      }


      if (rutasAntiguas.length > 0) {
        const rutasUnicas = [...new Set(rutasAntiguas)];
        const { error: errorBorrado } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(rutasUnicas);

        if (errorBorrado) {
          console.warn(
            "El registro se actualizó, pero no se pudieron borrar algunos archivos antiguos:",
            errorBorrado
          );
        }
      }

      await cargarHistorial();
      setRegistroEditando(null);
      setArchivosEdicion({});
      setDocumentosEliminados({});
      alert("Registro y documentos actualizados correctamente.");
    } catch (error: any) {

      if (rutasNuevas.length > 0) {
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove(rutasNuevas);
        } catch {
        }
      }

      console.error(error);
      alert(error?.message || "No se pudo actualizar el registro.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const seleccionarArchivo = (
    campo: CampoDocumento,
    archivo: File | undefined
  ) => {
    if (!archivo) return;

    setArchivosEdicion((actuales) => ({
      ...actuales,
      [campo]: archivo,
    }));

    setDocumentosEliminados((actuales) => ({
      ...actuales,
      [campo]: false,
    }));
  };

  const marcarDocumentoParaEliminar = (campo: CampoDocumento) => {
    setArchivosEdicion((actuales) => {
      const copia = { ...actuales };
      delete copia[campo];
      return copia;
    });

    setDocumentosEliminados((actuales) => ({
      ...actuales,
      [campo]: true,
    }));
  };

  const restaurarDocumento = (campo: CampoDocumento) => {
    setDocumentosEliminados((actuales) => ({
      ...actuales,
      [campo]: false,
    }));
  };

  const quitarArchivoNuevo = (campo: CampoDocumento) => {
    setArchivosEdicion((actuales) => {
      const copia = { ...actuales };
      delete copia[campo];
      return copia;
    });
  };

  const renderEditorDocumento = (
    campo: CampoDocumento,
    etiqueta: string
  ) => {
    const valorActual = registroEditando?.[campo];
    const tieneDocumentoActual =
      typeof valorActual === "string" &&
      valorActual.trim() !== "" &&
      valorActual !== "N/A";

    const archivoNuevo = archivosEdicion[campo];
    const seraEliminado = Boolean(documentosEliminados[campo]);

    return (
      <div
        key={campo}
        className="border border-slate-200 rounded-lg p-3 bg-slate-50"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">{etiqueta}</p>

            {archivoNuevo ? (
              <p className="text-xs text-blue-700 mt-1 break-all">
                Nuevo: {archivoNuevo.name}
              </p>
            ) : seraEliminado ? (
              <p className="text-xs text-red-600 mt-1">
                Se eliminará al guardar.
              </p>
            ) : tieneDocumentoActual ? (
              <a
                href={valorActual}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline mt-1 inline-block"
              >
                Ver documento actual
              </a>
            ) : (
              <p className="text-xs text-red-600 mt-1">Documento faltante</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded font-medium">
              {tieneDocumentoActual || archivoNuevo ? "Reemplazar" : "Subir"}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                disabled={guardandoEdicion}
                onChange={(e) =>
                  seleccionarArchivo(campo, e.target.files?.[0])
                }
              />
            </label>

            {archivoNuevo && (
              <button
                type="button"
                onClick={() => quitarArchivoNuevo(campo)}
                disabled={guardandoEdicion}
                className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded font-medium"
              >
                Quitar nuevo
              </button>
            )}

            {!archivoNuevo && tieneDocumentoActual && !seraEliminado && (
              <button
                type="button"
                onClick={() => marcarDocumentoParaEliminar(campo)}
                disabled={guardandoEdicion}
                className="text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-3 py-2 rounded font-medium"
              >
                Eliminar
              </button>
            )}

            {seraEliminado && (
              <button
                type="button"
                onClick={() => restaurarDocumento(campo)}
                disabled={guardandoEdicion}
                className="text-xs bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 px-3 py-2 rounded font-medium"
              >
                Deshacer
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const exportarExcel = (tipo: "general" | "por_equipo") => {
    if (tipo === "por_equipo" && !filtroEquipo) {
      return alert("Seleccione una cuadrilla en el filtro.");
    }

    let datosAExportar = registros;

    if (tipo === "por_equipo") {
      datosAExportar = registros.filter((r) => r.equipo_id === filtroEquipo);

      if (datosAExportar.length === 0) {
        return alert("No existen registros operativos.");
      }
    }

    const datosMapeados = datosAExportar.map((reg) => ({
      "Fecha Operativa": reg.fecha,
      "Hora EPP": formatearHora(reg.hora_epp),
      Operador: reg.proyecto,
      Cuadrilla: reg.equipo?.nombre_team || "No Asignado",
      "Team Leader": reg.team_leader || "Sin registro",
      "Técnicos": reg.tecnicos_registrados || "Sin registro",
      Asistencia:
        reg.observaciones === "EQUIPO NO LABORÓ EL DÍA DE HOY"
          ? "INASISTENCIA"
          : "LABORÓ",
      "Charla de 5 minutos": reg.registro_1_url ? "Entregado" : "Falta",
      "Check list de EPP": reg.registro_2_url ? "Entregado" : "Falta",
      "Check list de herramientas": reg.registro_3_url
        ? "Entregado"
        : "Falta",
      "Check list pre uso Sist. Contra caídas": reg.registro_4_url
        ? "Entregado"
        : "Falta",
      "Foto con EPPs": reg.foto_epp_url ? "Entregado" : "Falta",
      "ATS Unificado (Claro/Inte/Bitel)":
        reg.ats_unificado_url === "N/A"
          ? "N/A"
          : reg.ats_unificado_url
          ? "Entregado"
          : "Falta",
      "Permiso de trabajo eléctrico (Entel)":
        reg.permiso_electrico_url === "N/A"
          ? "N/A"
          : reg.permiso_electrico_url
          ? "Entregado"
          : "Falta",
      "Permiso de trabajo de altura (Entel)":
        reg.permiso_alturas_url === "N/A"
          ? "N/A"
          : reg.permiso_alturas_url
          ? "Entregado"
          : "Falta",
      "ATS Entel":
        reg.ats_entel_url === "N/A"
          ? "N/A"
          : reg.ats_entel_url
          ? "Entregado"
          : "Falta",
    }));

    const hoja = XLSX.utils.json_to_sheet(datosMapeados);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte Simecar");

    const nombreEquipo =
      tipo === "por_equipo"
        ? equipos
            .find((e) => e.id === filtroEquipo)
            ?.nombre_team.replace(/\s/g, "_")
        : "General";

    XLSX.writeFile(
      libro,
      `Simecar_Reporte_${nombreEquipo}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
  };

  const registrosMostrados = filtroEquipo
    ? registros.filter((r) => r.equipo_id === filtroEquipo)
    : registros;

  const totalRegistros = registrosMostrados.length;

  const inasistencias = registrosMostrados.filter(
    (r) => r.observaciones === "EQUIPO NO LABORÓ EL DÍA DE HOY"
  ).length;

  const operativos = totalRegistros - inasistencias;

  const datosPastel = [
    { name: "Operativos", value: operativos, color: "#16a34a" },
    { name: "Inasistencias", value: inasistencias, color: "#dc2626" },
  ];

  const conteoPorTeam = registrosMostrados.reduce(
    (acc: any, reg: any) => {
      const nombre = reg.equipo?.nombre_team || "Sin Team";
      if (!acc[nombre]) acc[nombre] = 0;
      acc[nombre] += 1;
      return acc;
    },
    {}
  );

  const datosBarras = Object.keys(conteoPorTeam)
    .map((key) => ({
      nombre: key,
      operaciones: conteoPorTeam[key],
    }))
    .sort((a, b) => b.operaciones - a.operaciones);

  if (cargandoAuth || !usuarioActivo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">
        Validando accesos...
      </div>
    );
  }

  const documentosEspecificosVisibles =
    editOperador === "Entel"
      ? DOCUMENTOS_ESPECIFICOS.filter((doc) =>
          [
            "permiso_electrico_url",
            "permiso_alturas_url",
            "ats_entel_url",
          ].includes(doc.campo)
        )
      : DOCUMENTOS_ESPECIFICOS.filter(
          (doc) => doc.campo === "ats_unificado_url"
        );

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800 relative">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white p-4 rounded shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Historial Analítico
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase">
                Usuario Conectado
              </p>
              <p className="text-sm font-medium">
                {usuarioActivo.correo}
                <span className="text-blue-600 font-bold ml-1">
                  ({usuarioActivo.rol})
                </span>
              </p>
            </div>

            <a
              href="/"
              className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded text-sm font-medium"
            >
              Volver al Panel
            </a>
          </div>
        </div>

        {!cargando && totalRegistros > 0 && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col gap-4">
              <div className="bg-white p-5 rounded border shadow-sm flex justify-between items-center border-l-4 border-l-blue-600">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    Total Registros
                  </p>
                  <p className="text-3xl font-black mt-1">{totalRegistros}</p>
                </div>
                <div className="text-blue-500 text-3xl">📋</div>
              </div>

              <div className="bg-white p-5 rounded border shadow-sm flex justify-between items-center border-l-4 border-l-green-500">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    Días Operativos
                  </p>
                  <p className="text-3xl font-black mt-1">{operativos}</p>
                </div>
                <div className="text-green-500 text-3xl">✅</div>
              </div>

              <div className="bg-white p-5 rounded border shadow-sm flex justify-between items-center border-l-4 border-l-red-500">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    Inasistencias
                  </p>
                  <p className="text-3xl font-black mt-1">{inasistencias}</p>
                </div>
                <div className="text-red-500 text-3xl">❌</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded border shadow-sm flex flex-col items-center justify-center">
              <h3 className="text-sm font-bold text-slate-600 uppercase mb-2">
                Tasa de Operatividad
              </h3>

              <div className="w-full h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={datosPastel}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={5}
                    >
                      {datosPastel.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-5 rounded border shadow-sm flex flex-col items-center justify-center">
              <h3 className="text-sm font-bold text-slate-600 uppercase mb-2">
                Registros por Team
              </h3>

              <div className="w-full h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosBarras}>
                    <XAxis
                      dataKey="nombre"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                    />
                    <Tooltip cursor={{ fill: "#f1f5f9" }} />
                    <Bar
                      dataKey="operaciones"
                      fill="#2563eb"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-5 rounded shadow-sm border mb-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold">Filtrar Cuadrilla:</label>

            <select
              className="p-2 border rounded text-sm focus:outline-none"
              value={filtroEquipo}
              onChange={(e) => setFiltroEquipo(e.target.value)}
            >
              <option value="">Todos los Registros</option>

              {[...equipos]
                .sort((a, b) =>
                  a.nombre_team.localeCompare(b.nombre_team, undefined, {
                    numeric: true,
                  })
                )
                .map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nombre_team}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => exportarExcel("por_equipo")}
              className="bg-green-600 text-white px-4 py-2 rounded shadow-sm text-sm font-medium"
            >
              Excel (Selección)
            </button>

            <button
              onClick={() => exportarExcel("general")}
              className="bg-slate-800 text-white px-4 py-2 rounded shadow-sm text-sm font-medium"
            >
              Excel (General)
            </button>
          </div>
        </div>

        {cargando ? (
          <div className="bg-white p-10 rounded text-center text-slate-500">
            Cargando base de datos...
          </div>
        ) : (
          <div className="bg-white rounded shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-100 border-b text-slate-700">
                  <tr>
                    <th className="p-4 font-semibold">Fecha</th>
                    <th className="p-4 font-semibold">Hora EPP</th>
                    <th className="p-4 font-semibold">Cuadrilla</th>
                    <th className="p-4 font-semibold">Operador</th>
                    <th className="p-4 font-semibold">Estatus</th>
                    <th className="p-4 font-semibold">Docs Obligatorios</th>
                    <th className="p-4 font-semibold">Específicos</th>

                    {usuarioActivo?.rol === "Admin" && (
                      <th className="p-4 font-semibold text-center">Gestión</th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {registrosMostrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-8 text-center text-slate-500"
                      >
                        No hay registros en el sistema.
                      </td>
                    </tr>
                  ) : (
                    registrosMostrados.map((reg) => (
                      <tr key={reg.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium">{reg.fecha}</td>
                        <td className="p-4">{formatearHora(reg.hora_epp) || "—"}</td>
                        <td className="p-4">
                          {reg.equipo?.nombre_team}
                        </td>

                        <td className="p-4">
                          <span className="bg-slate-200 px-2 py-1 rounded text-xs font-semibold">
                            {reg.proyecto}
                          </span>
                        </td>

                        <td className="p-4">
                          {reg.observaciones ===
                          "EQUIPO NO LABORÓ EL DÍA DE HOY" ? (
                            <span className="text-red-600 font-semibold bg-red-50 px-2 py-1 rounded text-xs">
                              INASISTENCIA
                            </span>
                          ) : (
                            <span className="text-green-600 font-semibold bg-green-50 px-2 py-1 rounded text-xs">
                              OPERATIVO
                            </span>
                          )}
                        </td>

                        <td className="p-4 flex gap-2">
                          {[
                            {
                              url: reg.registro_1_url,
                              label: "CH-5M",
                              title: "Charla de 5 minutos",
                            },
                            {
                              url: reg.registro_2_url,
                              label: "CK-EPP",
                              title: "Check list de EPP",
                            },
                            {
                              url: reg.registro_3_url,
                              label: "CK-HER",
                              title: "Check list de herramientas",
                            },
                            {
                              url: reg.registro_4_url,
                              label: "CK-CAI",
                              title: "Check list contra caídas",
                            },
                            {
                              url: reg.foto_epp_url,
                              label: "F-EPP",
                              title: "Foto EPPs",
                            },
                          ].map((doc, i) =>
                            doc.url ? (
                              <a
                                key={i}
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs bg-slate-100 border px-2 py-1.5 rounded font-medium text-slate-700 hover:bg-slate-200"
                                title={doc.title}
                              >
                                {doc.label}
                              </a>
                            ) : (
                              <span
                                key={i}
                                className="text-xs bg-red-50 border border-red-100 px-2 py-1.5 rounded text-red-400 line-through"
                                title={`Falta: ${doc.title}`}
                              >
                                {doc.label}
                              </span>
                            )
                          )}
                        </td>

                        <td className="p-4">
                          <div className="flex gap-2">
                            {["Claro", "Integratel", "Bitel"].includes(
                              reg.proyecto
                            ) &&
                              (reg.ats_unificado_url === "N/A" ? (
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">
                                  ATS: N/A
                                </span>
                              ) : reg.ats_unificado_url ? (
                                <a
                                  href={reg.ats_unificado_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1.5 rounded font-medium"
                                >
                                  ATS Unif.
                                </a>
                              ) : (
                                <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">
                                  Falta ATS
                                </span>
                              ))}

                            {reg.proyecto === "Entel" && (
                              <>
                                {reg.permiso_electrico_url === "N/A" ? (
                                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">
                                    Eléc: N/A
                                  </span>
                                ) : reg.permiso_electrico_url ? (
                                  <a
                                    href={reg.permiso_electrico_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded font-medium"
                                  >
                                    P. Eléctrico
                                  </a>
                                ) : (
                                  <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">
                                    Falta PE
                                  </span>
                                )}

                                {reg.permiso_alturas_url === "N/A" ? (
                                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">
                                    Alt: N/A
                                  </span>
                                ) : reg.permiso_alturas_url ? (
                                  <a
                                    href={reg.permiso_alturas_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1.5 rounded font-medium"
                                  >
                                    P. Alturas
                                  </a>
                                ) : (
                                  <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">
                                    Falta PA
                                  </span>
                                )}

                                {reg.ats_entel_url === "N/A" ? (
                                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1.5 rounded border">
                                    ATS: N/A
                                  </span>
                                ) : reg.ats_entel_url ? (
                                  <a
                                    href={reg.ats_entel_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1.5 rounded font-medium"
                                  >
                                    ATS Entel
                                  </a>
                                ) : (
                                  <span className="text-xs bg-red-50 border border-red-100 text-red-600 px-2 py-1.5 rounded">
                                    Falta ATS
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>

                        {usuarioActivo?.rol === "Admin" && (
                          <td className="p-4 text-center">
                            <div className="flex gap-2 justify-center">
                              <button
                                onClick={() => abrirModalEdicion(reg)}
                                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold py-1.5 px-3 rounded border border-blue-200"
                              >
                                Editar
                              </button>

                              <button
                                onClick={() => eliminarRegistro(reg)}
                                className="text-xs bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-1.5 px-3 rounded border border-red-200"
                              >
                                Eliminar
                              </button>
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
        <div className="fixed inset-0 bg-slate-900 bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[92vh] flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">Editar registro y documentos</h2>
              <p className="text-sm text-slate-500 mt-1">
                Cuadrilla:{" "}
                <span className="font-semibold text-slate-700">
                  {registroEditando.equipo?.nombre_team}
                </span>
              </p>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Fecha Operativa
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border rounded text-sm"
                    value={editFecha}
                    disabled={guardandoEdicion}
                    onChange={(e) => setEditFecha(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Hora EPP
                  </label>
                  <input
                    type="time"
                    step="60"
                    className="w-full p-2 border rounded text-sm"
                    value={editHora}
                    disabled={guardandoEdicion}
                    onChange={(e) => setEditHora(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Operador
                  </label>
                  <select
                    className="w-full p-2 border rounded text-sm"
                    value={editOperador}
                    disabled={guardandoEdicion}
                    onChange={(e) => setEditOperador(e.target.value)}
                  >
                    <option value="Claro">Claro</option>
                    <option value="Integratel">Integratel</option>
                    <option value="Bitel">Bitel</option>
                    <option value="Entel">Entel</option>
                  </select>
                </div>
              </div>

              <h3 className="font-bold text-slate-800 mb-3">
                Documentos obligatorios
              </h3>

              <div className="space-y-3">
                {DOCUMENTOS_OBLIGATORIOS.map((doc) =>
                  renderEditorDocumento(doc.campo, doc.etiqueta)
                )}
              </div>

              <h3 className="font-bold text-slate-800 mt-7 mb-3">
                Documentos específicos de {editOperador}
              </h3>

              <div className="space-y-3">
                {documentosEspecificosVisibles.map((doc) =>
                  renderEditorDocumento(doc.campo, doc.etiqueta)
                )}
              </div>
            </div>

            <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={cerrarModalEdicion}
                disabled={guardandoEdicion}
                className="bg-slate-200 hover:bg-slate-300 px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={guardarEdicion}
                disabled={guardandoEdicion}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium disabled:bg-slate-400"
              >
                {guardandoEdicion
                  ? "Subiendo y guardando..."
                  : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
