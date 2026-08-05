export type PetSpecies = "CANINA" | "FELINA";

export const PET_SPECIES_LABELS: Record<PetSpecies, string> = {
  CANINA: "Cachorro",
  FELINA: "Gato",
};

export const DEFAULT_BREEDS: Record<PetSpecies, string[]> = {
  CANINA: [
    "Spitz Alemão", "Shih Tzu", "Maltês", "Teckel", "Dachshund", "Lulu da Pomerânia",
    "Yorkshire", "Bulldogue", "Bulldogue Francês", "Pug", "Biewer Terrier", "Chihuahua",
  ],
  FELINA: ["Persa", "Maine Coon", "British Shorthair"],
};
