export interface MediaCredit {
  title: string;
  creator: string;
  source: string;
  project?: string;
  license: 'CC BY 4.0' | 'CC BY 3.0' | 'CC0 1.0' | 'Public-domain artwork' | 'Public-domain archive';
  material: string;
}

export const MEDIA_CREDITS: readonly MediaCredit[] = [
  {
    title: 'Sol Levante (2020)',
    project: 'https://s3.amazonaws.com/download.opencontent.netflix.com/index.html?prefix=SolLevante/',
    creator: 'Netflix / Production I.G.',
    source: 'https://s3.amazonaws.com/download.opencontent.netflix.com/SolLevante/creative-commons-attribution-4-intl-public-license.txt',
    license: 'CC BY 4.0',
    material: 'Frames from the official standard-dynamic-range video master.',
  },
  {
    title: 'Meridian (2016)',
    project: 'https://s3.amazonaws.com/download.opencontent.netflix.com/index.html?prefix=Meridian/',
    creator: '© Netflix Inc.',
    source: 'https://s3.amazonaws.com/download.opencontent.netflix.com/Meridian/creative-commons-attribution-4-intl-public-license.txt',
    license: 'CC BY 4.0',
    material: 'Current project-root master frames, converted for standard displays.',
  },
  {
    title: 'Nocturne (2018)',
    project: 'https://s3.amazonaws.com/download.opencontent.netflix.com/index.html?prefix=Nocturne/',
    creator: '© Netflix Inc.',
    source: 'https://s3.amazonaws.com/download.opencontent.netflix.com/Nocturne/creative-commons-attribution-4-intl-public-license.txt',
    license: 'CC BY 4.0',
    material: 'Current project-root master frames, converted for standard displays.',
  },
  {
    title: 'Sparks (2017)',
    project: 'https://s3.amazonaws.com/download.opencontent.netflix.com/index.html?prefix=sparks/',
    creator: '© Netflix Inc.',
    source: 'https://s3.amazonaws.com/download.opencontent.netflix.com/sparks/creative-commons-attribution-4-intl-public-license.txt',
    license: 'CC BY 4.0',
    material: 'Frames from the official standard-dynamic-range video master.',
  },
  {
    title: 'Spring (2019)',
    creator: '© Blender Foundation | cloud.blender.org/spring',
    source: 'https://studio.blender.org/projects/spring/pages/about/',
    license: 'CC BY 4.0',
    material: 'Frames from the released film.',
  },
  {
    title: 'Charge (2022)',
    creator: '(CC) Blender Foundation | studio.blender.org',
    source: 'https://studio.blender.org/projects/charge/',
    license: 'CC BY 4.0',
    material: 'Frames from the released film.',
  },
  {
    title: 'Coffee Run (2020)',
    creator: '(CC) Blender Foundation | studio.blender.org',
    source: 'https://studio.blender.org/projects/coffee-run/pages/licensing/',
    license: 'CC BY 4.0',
    material: 'Frames from the released film.',
  },
  {
    title: 'Wing It! (2023)',
    creator: '(CC) Blender Foundation | studio.blender.org',
    source: 'https://studio.blender.org/projects/wing-it/pages/licensing/',
    license: 'CC BY 4.0',
    material: 'Frames from the released film.',
  },
  {
    title: 'Glass Half (2015)',
    creator: '(CC) Blender Foundation | studio.blender.org',
    source: 'https://studio.blender.org/projects/api/assets/141/',
    license: 'CC BY 4.0',
    material: 'Frames from the official HD movie asset.',
  },
  {
    title: 'Tears of Steel (2012)',
    creator: '(CC) Blender Foundation | mango.blender.org',
    source: 'https://media.xiph.org/tearsofsteel/tearsofsteel-1080-png/README.txt',
    license: 'CC BY 3.0',
    material: 'Environment imagery from the released film, without identifiable actor portraits.',
  },
  {
    title: 'Sita Sings the Blues (2008)',
    creator: 'Nina Paley',
    source: 'https://www.sitasingstheblues.com/license.html',
    license: 'CC0 1.0',
    material: 'Film-derived visual material only. No soundtrack material is used.',
  },
  {
    title: "L'Inhumaine (1924)",
    creator: 'Georges Djo Bourgeois; historical poster via Wikimedia Commons and the cited Billposters source.',
    source: 'https://commons.wikimedia.org/wiki/File:L%27inhumaine_film1924.jpg',
    license: 'Public-domain artwork',
    material: 'Details from the original poster, not film frames.',
  },
  {
    title: 'The Golem (1920)',
    creator: 'Hans Poelzig; Museum of Modern Art, object 4987; reproduction via Wikimedia Commons.',
    source: 'https://commons.wikimedia.org/wiki/File:The_Golem_-_How_He_Came_into_the_World_(1920)_poster.jpg',
    license: 'Public-domain artwork',
    material: 'Details from the original poster, not film frames.',
  },
  {
    title: 'Les Vampires de la côte (1908)',
    creator: 'Cândido de Faria; Eye Filmmuseum.',
    source: 'https://commons.wikimedia.org/wiki/File:Les_Vampires_de_la_c%C3%B4te_-_C%C3%A2ndido_de_Faria_-_1908_-_EYE_A03060_-_neg0069.jpg',
    license: 'Public-domain artwork',
    material: 'Details from the original poster, not film frames.',
  },
  {
    title: 'All Dolled Up',
    creator: 'Rollin S. Sturgeon; Universal; Eye Filmmuseum / Open Images.',
    source: 'https://eye.openbeelden.nl/media/685751.en',
    license: 'Public-domain archive',
    material: 'Frames from the identified archive edition.',
  },
  {
    title: 'Edgar Allan Poe',
    creator: 'D.W. Griffith; American Mutoscope and Biograph; Eye Filmmuseum / Open Images.',
    source: 'https://eye.openbeelden.nl/media/685469.en',
    license: 'Public-domain archive',
    material: 'Frames from the identified archive edition.',
  },
  {
    title: 'Een kijkje in de dierentuin',
    creator: 'Universal; Eye Filmmuseum / Open Images.',
    source: 'https://eye.openbeelden.nl/media/687157.en',
    license: 'Public-domain archive',
    material: 'Frames from the identified archive edition.',
  },
  {
    title: 'Frank Merriwell in Arizona',
    creator: 'Feature Photoplay; Eye Filmmuseum / Open Images.',
    source: 'https://eye.openbeelden.nl/media/685595.en',
    license: 'Public-domain archive',
    material: 'Frames from the identified archive edition.',
  },
  {
    title: 'Schilderachtig Oud Amsterdam',
    creator: 'Orion Filmfabriek, The Hague; Eye Filmmuseum / Open Images.',
    source: 'https://eye.openbeelden.nl/media/687265.en',
    license: 'Public-domain archive',
    material: 'Frames from the identified archive edition.',
  },
  {
    title: 'The Four Seasons',
    creator: 'Raymond L. Ditmars and Charles Urban; Kineto Film Company of America; Eye Filmmuseum / Open Images.',
    source: 'https://eye.openbeelden.nl/media/685757.en',
    license: 'Public-domain archive',
    material: 'Frames from the identified archive edition.',
  },
];

export const MEDIA_LICENSE_URLS: Record<MediaCredit['license'], string> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Public-domain artwork': 'https://creativecommons.org/publicdomain/mark/1.0/',
  'Public-domain archive': 'https://creativecommons.org/publicdomain/mark/1.0/',
};
