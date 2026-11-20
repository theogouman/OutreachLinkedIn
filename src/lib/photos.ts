/** Adresse versionnée d'une photo servie par l'outil (/api/photos/<id>) ; null sans photo. */
export function adressePhoto(id: string, maj: Date | string | null): string | null {
  return maj ? `/api/photos/${id}?v=${new Date(maj).getTime()}` : null;
}
