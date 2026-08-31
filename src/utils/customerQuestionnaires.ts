import type { Customer } from "../types/crm";

export type QuestionnaireKind = "micropigmentacion" | "botox" | "pdrn" | "piercing";

export const questionnaireOptions: Array<{ kind: QuestionnaireKind; title: string; description: string }> = [
  { kind: "micropigmentacion", title: "Micropigmentación", description: "Cuestionario médico y consentimiento." },
  { kind: "botox", title: "Botox", description: "Cuestionario médico y consentimiento." },
  { kind: "pdrn", title: "PDRN de salmón", description: "Cuestionario médico y consentimiento." },
  { kind: "piercing", title: "Piercing", description: "Cuestionario médico y consentimiento." },
];

const today = () => new Date().toLocaleDateString("es-MX", { year: "numeric", month: "2-digit", day: "2-digit" });
const list = (items?: string[]) => items?.filter(Boolean).join(", ") || "";
const yesNo = (value?: "si" | "no" | "") => (value === "si" ? "Sí" : value === "no" ? "No" : "");

function safe(value?: string | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function brandHeader() {
  return `
    <header class="brand-header">
      <div class="brand-name"><span>DANIELA</span><strong>RODRIGUEZ</strong></div>
      <div class="brand-subtitle"><i></i><b>MAKE UP ARTIST</b><i></i></div>
    </header>
  `;
}

function page(content: string) {
  return `<section class="page"><div class="questionnaire-frame">${brandHeader()}${content}</div></section>`;
}

function field(label: string, value?: string, className = "") {
  return `<div class="field ${className}"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`;
}

function multiline(label: string, value?: string) {
  return `<div class="multiline"><span>${safe(label)}</span><p>${safe(value)}</p></div>`;
}

function signatureBlock() {
  return `
    <div class="signatures">
      <div><span></span><p>FIRMA CLIENTE</p></div>
      <div><span></span><p>DANIELA RODRÍGUEZ LEAL</p></div>
    </div>
  `;
}

function commonMedicalFields(customer: Customer, includeSeafood = false, includeHealing = false) {
  return `
    <div class="grid two">
      ${field("Nombre:", customer.name)}
      ${field("Fecha:", today())}
      ${field("Celular:", customer.whatsapp || customer.phone)}
      ${field("Correo electrónico:", customer.email)}
    </div>
    ${field("Recomendado por:", customer.referredBy)}
    ${multiline("Si ha padecido alguna enfermedad que crea que es importante, favor de señalarlo:", list(customer.diseases) || customer.medicalAlerts)}
    ${multiline("Por favor liste los medicamentos que está tomando (incluya aspirinas o cualquier remedio no controlado bajo receta):", customer.notes)}
    ${field("Operaciones recientes:", list(customer.surgeries))}
    ${field("¿Alergias?:", `${yesNo(customer.allergies?.length ? "si" : "")}${customer.allergies?.length ? ` - Menciónalos: ${list(customer.allergies)}` : ""}`)}
    ${field("¿Problemas o desajustes en la tiroides?:", yesNo(customer.thyroidIssues))}
    ${customer.bodyProducts !== undefined ? field("Productos que esté usando en su cuerpo:", customer.bodyProducts) : ""}
    ${customer.previousBotoxOrSubstance !== undefined ? field("¿Se ha aplicado anteriormente botox o alguna otra sustancia?:", yesNo(customer.previousBotoxOrSubstance)) : ""}
    ${customer.previousBotoxOrSubstance === "si" ? field("Cuál y fecha de aplicación:", customer.previousSubstanceDetails) : ""}
    ${customer.secondaryReactions !== undefined ? field("¿Hubo reacciones secundarias en ese procedimiento?:", yesNo(customer.secondaryReactions)) : ""}
    ${includeSeafood ? field("¿Alergias a mariscos?:", `${yesNo(customer.seafoodAllergy)}${customer.seafoodAllergy === "si" ? ` - Menciónalos: ${customer.seafoodAllergyDetails ?? ""}` : ""}`) : ""}
    ${includeHealing ? field("¿Problemas de cicatrización?:", yesNo(customer.healingProblems)) : ""}
  `;
}

function titleBlock(title: string) {
  return `
    <h1>CUESTIONARIO MÉDICO CONFIDENCIAL</h1>
    <h2>${safe(title)}</h2>
  `;
}

function questionnaireBody(kind: QuestionnaireKind, customer: Customer) {
  if (kind === "micropigmentacion") {
    return `
      ${page(`
        ${titleBlock("MICROPIGMENTACIÓN")}
        ${field("Fecha del retoque:", "")}
        <p class="small-title">Colores utilizados</p>
        <div class="grid three">
          ${field("Ojos:", "")}
          ${field("Cejas:", "")}
          ${field("Labios:", "")}
        </div>
        ${commonMedicalFields(customer)}
        ${multiline("Procedimientos anteriores de micropigmentación:", customer.previousProcedures)}
      `)}
      ${page(`
        <p>Si usted viene a realizarse un procedimiento correctivo, es importante que tenga el conocimiento que el procedimiento requiere de la primera sesión y un retoque posterior a los 45 días, cuyo costo es de $1,590.</p>
        <p>Cuando las cejas se realizaron anteriormente con un pigmento cuyo componente sea plomo y se sometan a un procedimiento correctivo, en ocasiones se requiere de un tercer retoque, dos meses posteriores al primer retoque, para encender el tono y fijar detalles del procedimiento.</p>
        <p>Si usted tiene la ceja virgen se requiere de la primera sesión y un retoque posterior a los 45 días, cuyo costo es de $1,590.</p>
        <p>Estoy en condiciones de recibir este tratamiento y soy consciente de que es un proceso en el que el área delineada estará inflamada de 24 a 48 horas. El resultado final se podrá apreciar hasta los 5 días o 1 semana de haberme realizado este tratamiento y las curaciones necesarias en mi piel.</p>
        <p>Me encuentro saludable para recibir este tratamiento y libero de responsabilidad a Daniela Rodríguez Leal / CENTRO DE BELLEZA DANIELA RODRÍGUEZ.</p>
        ${signatureBlock()}
      `)}
    `;
  }

  if (kind === "botox") {
    return `
      ${page(`
        ${titleBlock("BOTOX")}
        ${commonMedicalFields(customer)}
      `)}
      ${page(`
        <p>Estoy en condiciones de recibir este tratamiento y soy consciente de que es un proceso en el que el área a tratar puede inflamarse, presentar hematomas o alguna irritación.</p>
        <p>Esto depende en gran parte de los cuidados de cada persona por lo que, en esta etapa, me comprometo a seguir las indicaciones de los cuidados posteriores al botox que se me indicaron.</p>
        <p>Me encuentro saludable para recibir este tratamiento y libero de responsabilidad a Daniela Rodríguez Leal / CENTRO DE BELLEZA DANIELA RODRÍGUEZ.</p>
        ${signatureBlock()}
      `)}
    `;
  }

  if (kind === "pdrn") {
    return `
      ${page(`
        ${titleBlock("PDRN DE SALMÓN")}
        ${commonMedicalFields(customer, true)}
      `)}
      ${page(`
        <p>Estoy en condiciones de recibir el tratamiento con PDRN de salmón y soy consciente de que es un procedimiento en el que el área tratada puede presentar enrojecimiento, inflamación, sensibilidad, pequeños hematomas o alguna irritación temporal.</p>
        <p>Entiendo que la respuesta al tratamiento depende de las características de cada persona y, en gran parte, del cumplimiento de los cuidados posteriores, por lo que me comprometo a seguir todas las indicaciones que me fueron proporcionadas.</p>
        <p>Me encuentro saludable para recibir este tratamiento y libero de responsabilidad a Daniela Rodríguez Leal / CENTRO DE BELLEZA DANIELA RODRÍGUEZ.</p>
        ${signatureBlock()}
      `)}
    `;
  }

  return `
    ${page(`
      ${titleBlock("PIERCING")}
      ${commonMedicalFields(customer, false, true)}
      ${field("Enfermedades recientes:", list(customer.diseases))}
    `)}
    ${page(`
      <p>Estoy en condiciones de recibir este procedimiento, soy consciente de que es un proceso en el que el área perforada puede llegar a presentar cierta inflamación dentro del periodo de 24 a 72 horas.</p>
      <p>Esto depende en gran parte del tipo de cicatrización y cuidados de cada persona por lo que, en esta etapa, me comprometo a seguir las indicaciones de los cuidados posteriores a la perforación que se me indicaron.</p>
      <p>Me encuentro saludable para recibir este tratamiento y libero de responsabilidad a Daniela Rodríguez Leal / CENTRO DE BELLEZA DANIELA RODRÍGUEZ.</p>
      ${signatureBlock()}
    `)}
  `;
}

export function buildQuestionnaireHtml(kind: QuestionnaireKind, customer: Customer) {
  const option = questionnaireOptions.find((item) => item.kind === kind);
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>${safe(option?.title ?? "Cuestionario")} - ${safe(customer.name)}</title>
      <style>
        @page { size: letter; margin: 9mm; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f7f2f4; color: #191417; font-family: Georgia, "Times New Roman", serif; }
        .toolbar { position: sticky; top: 0; display: flex; gap: 12px; justify-content: center; padding: 14px; background: rgba(255,255,255,.92); border-bottom: 1px solid #ead7df; z-index: 2; }
        .toolbar button { border: 0; border-radius: 999px; padding: 10px 18px; background: #e85c93; color: white; cursor: pointer; font: 600 14px Arial, sans-serif; }
        .toolbar button.secondary { background: #191417; }
        .sheet { width: 216mm; max-width: 100%; margin: 18px auto; }
        .page { min-height: 260mm; margin-bottom: 18px; padding: 9mm; background: white; box-shadow: 0 12px 40px rgba(54, 24, 38, .08); page-break-after: always; }
        .questionnaire-frame { min-height: 242mm; border: 2px solid #d889c0; padding: 10mm 11mm 12mm; }
        .brand-header { margin: -3mm 0 12mm; padding-top: 1mm; border-top: 2px solid #d889c0; text-align: center; font-family: Arial, Helvetica, sans-serif; }
        .brand-name { display: flex; align-items: baseline; justify-content: center; gap: 0; line-height: .92; letter-spacing: .08em; }
        .brand-name span { color: #d889c0; font-size: 48px; font-weight: 900; }
        .brand-name strong { color: #111; font-size: 44px; font-weight: 300; letter-spacing: .06em; }
        .brand-subtitle { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; margin: 7px auto 0; width: 92%; color: #d889c0; }
        .brand-subtitle i { display: block; height: 2px; background: #d889c0; }
        .brand-subtitle b { font-size: 20px; font-weight: 500; letter-spacing: .02em; }
        h1 { width: fit-content; margin: 0 auto 8px; color: #e85c93; border-bottom: 2px solid #e85c93; text-align: center; font-family: Arial, Helvetica, sans-serif; font-size: 19px; letter-spacing: .04em; }
        h2 { margin: 8px 0 20px; text-align: center; font-family: Arial, Helvetica, sans-serif; font-size: 22px; letter-spacing: .03em; }
        p { font-size: 15px; line-height: 1.62; text-align: justify; }
        .small-title { margin: 0 0 8px; font-size: 14px; text-align: left; }
        .grid { display: grid; gap: 10px; }
        .grid.two { grid-template-columns: 1fr 1fr; }
        .grid.three { grid-template-columns: repeat(3, 1fr); }
        .field { min-height: 32px; display: flex; align-items: end; gap: 8px; margin: 8px 0; font-size: 14px; }
        .field span { white-space: nowrap; }
        .field strong { flex: 1; min-height: 23px; border-bottom: 1.5px solid #161616; font-weight: 400; padding: 0 4px 2px; }
        .multiline { margin: 11px 0; font-size: 14px; }
        .multiline span { display: block; margin-bottom: 4px; }
        .multiline p { min-height: 52px; margin: 0; padding: 6px 4px; border-bottom: 1.5px solid #161616; font-size: 14px; line-height: 1.4; text-align: left; white-space: pre-wrap; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 38px; margin-top: 70px; text-align: center; }
        .signatures span { display: block; border-bottom: 1.5px solid #161616; height: 32px; }
        .signatures p { margin: 8px 0 0; text-align: center; font-size: 12px; letter-spacing: .04em; }
        @media (max-width: 820px) {
          .brand-name span { font-size: 36px; }
          .brand-name strong { font-size: 33px; }
          .brand-subtitle b { font-size: 16px; }
          .grid.two, .grid.three { grid-template-columns: 1fr; }
        }
        @media print {
          body { background: white; }
          .toolbar { display: none; }
          .sheet { margin: 0; width: auto; }
          .page { margin: 0; padding: 0; box-shadow: none; }
          .questionnaire-frame { min-height: 260mm; }
        }
      </style>
    </head>
    <body>
      <div class="toolbar">
        <button onclick="window.print()">Imprimir / guardar como PDF</button>
        <button class="secondary" onclick="window.close()">Cerrar</button>
      </div>
      <main class="sheet">${questionnaireBody(kind, customer)}</main>
    </body>
  </html>`;
}

export function printQuestionnaire(kind: QuestionnaireKind, customer: Customer) {
  const printWindow = window.open("", "_blank", "width=980,height=820");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(buildQuestionnaireHtml(kind, customer));
  printWindow.document.close();
  printWindow.focus();
  return true;
}

export function downloadQuestionnaire(kind: QuestionnaireKind, customer: Customer) {
  const option = questionnaireOptions.find((item) => item.kind === kind);
  const filename = `${option?.title ?? "cuestionario"}-${customer.name}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const blob = new Blob([buildQuestionnaireHtml(kind, customer)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.html`;
  link.click();
  URL.revokeObjectURL(url);
}
