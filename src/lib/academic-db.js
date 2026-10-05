/**
 * Simulación de Base de Datos del Sistema Académico de la UBA (SIU Guaraní / Registro de Graduados)
 * Provee datos de alumnos confirmados para emisión de diplomas digitales.
 */

const INITIAL_GRADUATES = [
  {
    id: "grad-001",
    name: "Juan Ignacio Pérez",
    dni: "38123456",
    degreeName: "Licenciatura en Ciencias de la Computación",
    faculty: "Facultad de Ciencias Exactas y Naturales",
    achievementType: "BachelorDegree",
    graduationDate: "2026-11-20",
    status: "CONFIRMADO", // Listo para emitir VC
    bookNumber: "Libro 142",
    folio: "Folio 88"
  },
  {
    id: "grad-002",
    name: "Dra. Sofía Victoria Rossi",
    dni: "39456789",
    degreeName: "Médica",
    faculty: "Facultad de Medicina",
    achievementType: "MasterDegree",
    graduationDate: "2026-10-15",
    status: "CONFIRMADO",
    bookNumber: "Libro 210",
    folio: "Folio 12"
  },
  {
    id: "grad-003",
    name: "Mariano Agustín Fernández",
    dni: "36789123",
    degreeName: "Abogado",
    faculty: "Facultad de Derecho",
    achievementType: "BachelorDegree",
    graduationDate: "2026-09-30",
    status: "CONFIRMADO",
    bookNumber: "Libro 98",
    folio: "Folio 405"
  },
  {
    id: "grad-004",
    name: "Camila Lucía Morales",
    dni: "40112233",
    degreeName: "Ingeniería en Informática",
    faculty: "Facultad de Ingeniería",
    achievementType: "BachelorDegree",
    graduationDate: "2026-12-05",
    status: "CONFIRMADO",
    bookNumber: "Libro 77",
    folio: "Folio 19"
  },
  {
    id: "grad-005",
    name: "Tomás Ezequiel Benítez",
    dni: "37445566",
    degreeName: "Licenciatura en Ciencias de Datos",
    faculty: "Facultad de Ciencias Exactas y Naturales",
    achievementType: "BachelorDegree",
    graduationDate: "2026-11-25",
    status: "CONFIRMADO",
    bookNumber: "Libro 143",
    folio: "Folio 04"
  }
];

class AcademicDatabase {
  constructor() {
    this.graduates = new Map();
    INITIAL_GRADUATES.forEach(g => this.graduates.set(g.id, { ...g }));
  }

  getAllGraduates() {
    return Array.from(this.graduates.values());
  }

  getGraduate(id) {
    return this.graduates.get(id);
  }

  addGraduate(graduateData) {
    const id = graduateData.id || `grad-${Date.now().toString().slice(-4)}`;
    const record = {
      id,
      name: graduateData.name,
      dni: graduateData.dni,
      degreeName: graduateData.degreeName,
      faculty: graduateData.faculty || 'Facultad de Ciencias Exactas y Naturales',
      achievementType: graduateData.achievementType || 'BachelorDegree',
      graduationDate: graduateData.graduationDate || new Date().toISOString().split('T')[0],
      status: 'CONFIRMADO',
      bookNumber: graduateData.bookNumber || 'Libro 150',
      folio: graduateData.folio || 'Folio 01'
    };
    this.graduates.set(id, record);
    return record;
  }

  setGraduates(list) {
    this.graduates.clear();
    for (const g of list) {
      this.graduates.set(g.id, g);
    }
  }
}

const academicDatabaseInstance = new AcademicDatabase();
export { academicDatabaseInstance as academicDb, AcademicDatabase };
export default academicDatabaseInstance;
