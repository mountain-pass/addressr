import MurmurHash3 from 'imurmurhash';
import { AbortController } from 'node-abort-controller';
import PropTypes from 'prop-types';
import React, { Fragment } from 'react';
import Autosuggest from 'react-autosuggest';
import { Tab, TabList, TabPanel, Tabs } from 'react-tabs';
import { fetchLink } from '@windyroad/fetch-link';

const hashState = new MurmurHash3();

const getSuggestionValue = suggestion => {
  return suggestion.sla;
};

const renderSuggestion = suggestion => {
  return (
    <div dangerouslySetInnerHTML={{ __html: suggestion.highlight.sla }} />
  );
};

const AddressrTd = props => {
  const { value, colSpan, rowSpan } = props;
  return (
    <td
      rowSpan={rowSpan}
      colSpan={colSpan}
      style={{
        ...(value && {
          background: 'white',
          color: '#242943',
          fontWeight: 'bold',
        }),
      }}
    >
      {value || '-'}
    </td>
  );
};

AddressrTd.propTypes = {
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  colSpan: PropTypes.string,
  rowSpan: PropTypes.string,
};

AddressrTd.defaultProps = {
  value: undefined,
  colSpan: '1',
  rowSpan: '1',
};

class Search extends React.Component {
  constructor() {
    super();

    // Autosuggest is a controlled component.
    // This means that you need to provide an input value
    // and an onChange handler that updates this value (see below).
    // Suggestions also need to be provided to the Autosuggest,
    // and they are initially empty because the Autosuggest is closed.
    this.state = {
      value: '',
      suggestions: [],
      addressr: undefined,
      controller: undefined,
    };
  }

  async componentDidMount() {
    const addressr = await fetchLink('https://api.addressr.io');
    this.setState({
      addressr
    });
  }

  onChange = (event, { newValue }) => {
    this.setState({
      value: newValue,
    });
  };

  // Autosuggest will call this function every time you need to update suggestions.
  // You already implemented this logic above, so just use it.
  onSuggestionsFetchRequested = (addressr) => {
    return ({ value }) => {
      this.search(value, addressr);
    };
  };

  // Autosuggest will call this function every time you need to clear suggestions.
  onSuggestionsClearRequested = () => {
    this.setState({
      suggestions: [],
    });
  };

  onSuggestionSelected = (event, { suggestion }) => {
    this.setSelected(suggestion);
  };

  async setSelected(selected) {
    const canonical = await fetchLink(`https://api.addressr.io/addresses/${selected.pid}`);
    const json = await canonical.json();
    console.log({json})
    this.setState({
        selected: json,
      });
    // const canonical = await selected.item.invoke('canonical');
    // const body = await canonical.body();
    // this.setState({
    //   selected: body,
    // });
  }

  async search(value, addressr) {
    this.state.controller?.abort();
    const controller = new AbortController();
    this.setState({
      controller,
    });
    const link = addressr.links('https://addressr.io/rels/address-search', { q: value.trim() })[0];
    try {
      const results = await fetchLink(link, { signal: controller.signal });
      // const results = await searchLink.invoke(
      //   { q: value },
      //   { signal: this.controller.signal },
      // );
      const items = await results.json();
      // const items = await Promise.all(
      //   results.ops.filter('item').map(op => op.invoke()),
      // );
  //    const itemBodies = await Promise.all(items.map(item => item.json()));    
      // const itemBodies = await Promise.all(items.map(item => item.body()));
      this.setState({
        suggestions: items,
      });
    }
    catch(error) {
      if( error.name === 'AbortError' ) {
        // ignore
      }
      else {
        console.error({name: error.name});
        console.error(error);
        console.error({error});
        console.error(error.message);
        throw error;
      }
    }
  }

  render() {
    const { value, suggestions, selected, addressr } = this.state;

    // Autosuggest will pass through all these props to the input.
    const inputProps = {
      placeholder: 'Address',
      value,
      onChange: this.onChange,
      className: 'highlight',
    };

    // Finally, render it!
    return (
      <>
        <div>
          <label style={{ width: '100%', textAlign: 'center' }}>
            Try me out
          </label>
          {addressr ? (
            <Autosuggest
              suggestions={suggestions}
              onSuggestionsFetchRequested={this.onSuggestionsFetchRequested(
                addressr
              )}
              onSuggestionsClearRequested={this.onSuggestionsClearRequested}
              getSuggestionValue={getSuggestionValue}
              renderSuggestion={renderSuggestion}
              onSuggestionSelected={this.onSuggestionSelected}
              inputProps={inputProps}
            />
          ) : (
            'loading...'
          )}
          {selected ? (
            <Tabs>
              <TabList>
                <Tab>Multi-line Address</Tab>
                {selected.smla ? <Tab>Short Multi-line Address</Tab> : ''}
                <Tab>Structure Address</Tab>
                <Tab>Geo</Tab>
              </TabList>

              <TabPanel>
                <table>
                  <tbody>
                    {selected.mla.map(item => {
                      return (
                        <tr key={item}>
                          <td>{item}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TabPanel>
              {selected.smla ? (
                <TabPanel>
                  <table>
                    <tbody>
                      {selected.smla.map(item => {
                        return (
                          <tr key={item}>
                            <td>{item}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TabPanel>
              ) : (
                ''
              )}
              <TabPanel>
                <table className="address">
                  <tbody>
                    <tr>
                      <th>Building Name</th>
                      <AddressrTd
                        colSpan="4"
                        value={selected?.structured.buildingName}
                      />
                    </tr>
                    <tr>
                      <th rowSpan="2">Lot Number</th>
                      <th colSpan="2">Prefix</th>
                      <th>Number</th>
                      <th>Suffix</th>
                    </tr>
                    <tr>
                      <AddressrTd
                        colSpan="2"
                        value={selected?.structured.lotNumber?.prefix}
                      />
                      <AddressrTd
                        value={selected?.structured.lotNumber?.number}
                      />
                      <AddressrTd
                        value={selected?.structured.lotNumber?.suffix}
                      />
                    </tr>
                    <tr>
                      <th rowSpan="2">Flat</th>
                      <th>Type</th>
                      <th>Prefix</th>
                      <th>Number</th>
                      <th>Suffix</th>
                    </tr>
                    <tr>
                      <AddressrTd
                        value={selected?.structured.flat?.type?.name}
                      />
                      <AddressrTd value={selected?.structured.flat?.prefix} />
                      <AddressrTd value={selected?.structured.flat?.number} />
                      <AddressrTd value={selected?.structured.flat?.suffix} />
                    </tr>
                    <tr>
                      <th rowSpan="2">Level</th>
                      <th>Type</th>
                      <th>Prefix</th>
                      <th>Number</th>
                      <th>Suffix</th>
                    </tr>
                    <tr>
                      <AddressrTd
                        value={selected?.structured.level?.type?.name}
                      />
                      <AddressrTd value={selected?.structured.level?.prefix} />
                      <AddressrTd value={selected?.structured.level?.number} />
                      <AddressrTd value={selected?.structured.level?.suffix} />
                    </tr>
                    <tr>
                      <th rowSpan="2">Number</th>
                      <th colSpan="2">Prefix</th>
                      <th>Number</th>
                      <th>Suffix</th>
                    </tr>
                    <tr>
                      <AddressrTd
                        colSpan="2"
                        value={selected?.structured.number?.prefix}
                      />
                      <AddressrTd value={selected?.structured.number?.number} />
                      <AddressrTd value={selected?.structured.number?.suffix} />
                    </tr>
                    <tr>
                      <th rowSpan="2">Number To</th>
                      <th colSpan="2">Prefix</th>
                      <th>Number</th>
                      <th>Suffix</th>
                    </tr>
                    <tr>
                      <AddressrTd
                        colSpan="2"
                        value={selected?.structured.number?.last?.prefix}
                      />
                      <AddressrTd
                        value={selected?.structured.number?.last?.number}
                      />
                      <AddressrTd
                        value={selected?.structured.number?.last?.suffix}
                      />
                    </tr>
                    <tr>
                      <th rowSpan="2">Street</th>
                      <th colSpan="2">Name</th>
                      <th>Type</th>
                      <th>Suffix</th>
                    </tr>
                    <tr>
                      <AddressrTd
                        colSpan="2"
                        value={selected?.structured.street?.name}
                      />
                      <AddressrTd
                        value={selected?.structured.street?.type?.code}
                      />
                      <AddressrTd
                        value={selected?.structured.street?.suffix?.name}
                      />
                    </tr>
                    <tr>
                      <th>Suburb</th>
                      <AddressrTd
                        colSpan="4"
                        value={selected?.structured.locality.name}
                      />
                    </tr>
                    <tr>
                      <th>State</th>
                      <AddressrTd
                        colSpan="4"
                        value={selected?.structured.state.name}
                      />
                    </tr>
                    <tr>
                      <th>Post Code</th>
                      <AddressrTd
                        colSpan="4"
                        value={selected?.structured.postcode}
                      />
                    </tr>
                  </tbody>
                </table>
              </TabPanel>
              <TabPanel>
                <table className="address">
                  <tbody>
                    <tr>
                      <th>Level</th>
                      <td colSpan="2">{selected.geocoding.level.name}</td>
                    </tr>
                    {selected.geocoding.geocodes.map(geocode => {
                      return (
                        <Fragment
                          key={hashState.hash(JSON.stringify(geocode)).result()}
                        >
                          <tr>
                            <AddressrTd rowSpan="5" value={geocode.type.name} />
                            <th>latitude</th>
                            <th>longitude</th>
                          </tr>
                          <tr>
                            <AddressrTd value={geocode.latitude} />
                            <AddressrTd value={geocode.longitude} />
                          </tr>
                          <tr>
                            <th>default</th>
                            <th>reliability</th>
                          </tr>
                          <tr>
                            <AddressrTd
                              value={geocode.default ? 'true' : 'false'}
                            />
                            <AddressrTd value={geocode.reliability?.name} />
                          </tr>
                          <tr>
                            <td colSpan="2" style={{ padding: 0 }}>
                              <iframe
                                title={selected.pid}
                                // width="600"
                                // height="450"
                                style={{
                                  border: '0',
                                  width: '100%',
                                  height: '20em',
                                }}
                                loading="lazy"
                                allowFullScreen
                                src={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBJ9PUmI2aKEpQ93-7KJhFUrPvreaRQBac&center=${geocode.latitude},${geocode.longitude}&zoom=18&maptype=satellite`}
                              />
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TabPanel>
            </Tabs>
          ) : (
            ''
          )}
        </div>
      </>
    );
  }
}

export default Search;
