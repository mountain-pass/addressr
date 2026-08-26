export interface AddressSearchResult {
  sla: string;
  ssla?: string;
  score: number;
  pid: string;
  highlight: {
    sla: string;
    ssla?: string;
  };
}

export interface StructuredAddress {
  buildingName?: string;
  lotNumber?: { prefix?: string; number: string };
  flat?: { type?: { code: string; name: string }; prefix?: string; number: number; suffix?: string };
  level?: { type?: { code: string; name: string }; prefix?: string; number: number; suffix?: string };
  number?: { prefix?: string; number: number; suffix?: string; last?: { prefix?: string; number: number; suffix?: string } };
  street?: { name: string; type?: { code: string; name: string }; suffix?: { code: string; name: string }; class?: { code: string; name: string } };
  locality: { name: string; class?: { code: string; name: string } };
  state: { name: string; abbreviation: string };
  postcode: string;
  confidence: number;
}

export interface AddressGeocoding {
  level: { code: string; name: string };
  geocodes: Array<{
    default: boolean;
    type: { code: string; name: string };
    reliability: { code: string; name: string };
    latitude: number;
    longitude: number;
  }>;
}

export interface AddressDetail {
  pid: string;
  sla: string;
  ssla?: string;
  mla: string[];
  smla?: string[];
  structured: StructuredAddress;
  geocoding?: AddressGeocoding;
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export interface PostcodeSearchResult {
  postcode: string;
  localities: Array<{ name: string }>;
}

export interface LocalitySearchResult {
  name: string;
  state: { name: string; abbreviation: string };
  class?: { code: string; name: string };
  postcode: string;
  score: number;
  pid: string;
}

export interface StateSearchResult {
  name: string;
  abbreviation: string;
}
