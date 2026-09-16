from pathlib import Path
import re

from fpdf import FPDF

base = Path(r"C:\Users\LENOVO\Documents\Default Project\pawmily-backend\documentacion\DOCUMENTACION_PAWMILY")


class PDF(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100)
        self.cell(0, 10, f"PawMily - Pagina {self.page_no()}", align="C")


def clean(text: str) -> str:
    text = re.sub(r"```[\s\S]*?```", "\n[diagrama/codigo omitido en PDF - ver .md]\n", text)
    repl = {
        "\u2014": "-",
        "\u2013": "-",
        "\u2022": "-",
        "\u2192": "->",
        "\u2190": "<-",
        "\u00a0": " ",
        "\u2713": "[OK]",
        "\u2717": "[X]",
    }
    for a, b in repl.items():
        text = text.replace(a, b)
    return text.encode("latin-1", "replace").decode("latin-1")


def md_to_pdf(md_path: Path, pdf_path: Path, title: str) -> None:
    raw = md_path.read_text(encoding="utf-8")
    text = clean(raw)
    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.multi_cell(0, 10, clean(title))
    pdf.ln(2)
    pdf.set_font("Helvetica", size=10)
    for line in text.splitlines():
        # Avoid fpdf width crash on markdown tables / separators
        if "|" in line and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(set(c) <= set("-: ") for c in cells):
                continue
            line = " | ".join(cells)
        if line.startswith("# "):
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 14)
            pdf.multi_cell(0, 8, clean(line[2:]))
            pdf.set_font("Helvetica", size=10)
        elif line.startswith("## "):
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 12)
            pdf.multi_cell(0, 7, clean(line[3:]))
            pdf.set_font("Helvetica", size=10)
        elif line.startswith("### "):
            pdf.set_x(pdf.l_margin)
            pdf.set_font("Helvetica", "B", 11)
            pdf.multi_cell(0, 6, clean(line[4:]))
            pdf.set_font("Helvetica", size=10)
        else:
            pdf.set_x(pdf.l_margin)
            content = clean(line) if line.strip() else " "
            # hard-wrap very long lines
            while len(content) > 110:
                pdf.multi_cell(0, 5, content[:110])
                content = content[110:]
                pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 5, content)
    pdf.output(str(pdf_path))
    print("PDF", pdf_path.name)


def box_svg(path: Path, title: str, boxes: list[str]) -> None:
    w, h = 900, 520
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}">',
        '<rect width="100%" height="100%" fill="#EEF2F5"/>',
        f'<text x="20" y="36" font-family="Arial" font-size="22" fill="#2C5F5A" font-weight="bold">{title}</text>',
    ]
    x, y = 30, 70
    for b in boxes:
        parts.append(f'<rect x="{x}" y="{y}" width="250" height="70" rx="10" fill="#2C5F5A"/>')
        parts.append(
            f'<text x="{x + 20}" y="{y + 42}" font-family="Arial" font-size="16" fill="#fff">{b}</text>'
        )
        x += 300
        if x > 600:
            x = 30
            y += 110
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")
    print("SVG", path.name)


def main() -> None:
    pairs = [
        (
            base / "01_Gestion_y_Requerimientos" / "SRS_Especificacion_Requerimientos.md",
            base / "01_Gestion_y_Requerimientos" / "SRS_Especificacion_Requerimientos.pdf",
            "SRS PawMily",
        ),
        (
            base / "01_Gestion_y_Requerimientos" / "Backlog_e_Historias_de_Usuario.md",
            base / "01_Gestion_y_Requerimientos" / "Backlog_e_Historias_de_Usuario.pdf",
            "Backlog e Historias",
        ),
        (
            base / "02_Arquitectura_y_Diseno" / "SAD_Documento_de_Arquitectura.md",
            base / "02_Arquitectura_y_Diseno" / "SAD_Documento_de_Arquitectura.pdf",
            "SAD Arquitectura",
        ),
        (
            base / "02_Arquitectura_y_Diseno" / "Modelo_de_Datos" / "Diccionario_de_Datos.md",
            base / "02_Arquitectura_y_Diseno" / "Modelo_de_Datos" / "Diccionario_de_Datos.pdf",
            "Diccionario de Datos",
        ),
        (
            base / "03_Manuales_Tecnicos_y_DevOps" / "Manual_de_Configuracion_y_Desarrollo_Local.md",
            base / "03_Manuales_Tecnicos_y_DevOps" / "Manual_de_Configuracion_y_Desarrollo_Local.pdf",
            "Manual Config Local",
        ),
        (
            base / "03_Manuales_Tecnicos_y_DevOps" / "Guia_de_Despliegue_en_Produccion.md",
            base / "03_Manuales_Tecnicos_y_DevOps" / "Guia_de_Despliegue_en_Produccion.pdf",
            "Guia Despliegue",
        ),
        (
            base / "04_Manuales_de_Usuario_y_Soporte" / "Manual_de_Usuario_Final.md",
            base / "04_Manuales_de_Usuario_y_Soporte" / "Manual_de_Usuario_Final.pdf",
            "Manual Usuario Final",
        ),
        (
            base / "04_Manuales_de_Usuario_y_Soporte" / "Manual_de_Administrador_y_Soporte.md",
            base / "04_Manuales_de_Usuario_y_Soporte" / "Manual_de_Administrador_y_Soporte.pdf",
            "Manual Administrador",
        ),
    ]
    for md, pdf, title in pairs:
        md_to_pdf(md, pdf, title)

    uml = base / "02_Arquitectura_y_Diseno" / "Diagramas_UML"
    modelo = base / "02_Arquitectura_y_Diseno" / "Modelo_de_Datos"
    box_svg(uml / "Componentes.svg", "Componentes PawMily", ["Web Vet", "API Clean/DDD", "Postgres", "App Owner"])
    box_svg(uml / "Despliegue.svg", "Despliegue", ["Vercel Web", "Railway API", "Supabase DB", "Android"])
    box_svg(uml / "Casos_de_Uso.svg", "Casos de Uso", ["Vet gestiona", "Owner vincula", "Expediente", "Agenda"])
    box_svg(
        uml / "Secuencia_Procesos_Criticos.svg",
        "Secuencias criticas",
        ["Login/Refresh", "Link code", "Approve", "List mine"],
    )
    box_svg(
        modelo / "Diagrama_Entidad_Relacion.svg",
        "DER PawMily",
        ["User", "Patient", "LinkRequest", "MedicalRecord", "Feeding", "Reminder", "Appointment"],
    )

    try:
        from PIL import Image, ImageDraw

        def make_png(path: Path, title: str, labels: list[str]) -> None:
            img = Image.new("RGB", (1000, 560), "#EEF2F5")
            d = ImageDraw.Draw(img)
            d.text((24, 20), title, fill="#2C5F5A")
            x, y = 40, 80
            for lab in labels:
                d.rounded_rectangle((x, y, x + 220, y + 70), radius=12, fill="#2C5F5A")
                d.text((x + 16, y + 24), lab, fill="white")
                x += 240
                if x > 700:
                    x = 40
                    y += 100
            img.save(path)
            print("PNG", path.name)

        make_png(uml / "Componentes.png", "Componentes PawMily", ["Web Vet", "API", "Postgres", "Android"])
        make_png(uml / "Despliegue.png", "Despliegue", ["Vercel", "Railway", "Supabase", "Android"])
        make_png(uml / "Casos_de_Uso.png", "Casos de Uso", ["Vet", "Owner", "Expediente", "Agenda"])
        make_png(uml / "Secuencia_Procesos_Criticos.png", "Secuencias", ["Login", "Link", "Approve", "Mine"])
        make_png(modelo / "Diagrama_Entidad_Relacion.png", "DER", ["User", "Patient", "Link", "Med", "Feed", "Rem", "Apt"])
    except Exception as e:
        print("pillow skip", e)

    print("DONE")


if __name__ == "__main__":
    main()
