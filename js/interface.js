let data = Fliplet.Widget.getData();
let initialResult = data.result;
let settings = data.settings;
let app = new Vue({
  el: '#app',
  created() {
    if (initialResult) {
      console.log(`parsing result:`, JSON.parse(JSON.stringify(initialResult)));
      this.filters = initialResult.filters.$and.map((filterDataEntry) => {
        let columnKey = Object.keys(filterDataEntry)[0];
        let innerObject = filterDataEntry[columnKey];
        let sequelizeOperator = Object.keys(innerObject)[0];
        let columnValue = innerObject[sequelizeOperator];
        let filter = {
          column: columnKey
        };
        if (sequelizeOperator === '$eq') {
          filter.operator = 'is exactly';
          filter.ignoreCase = false;
          filter.value = columnValue;
        } else if (sequelizeOperator === '$iLike') {
          filter.ignoreCase = true;
          if (columnValue.includes('\\%')) {
            filter.operator = 'like';
            filter.value = columnValue.replace('\\%', '%');
          } else {
            // Convert to mask to process all 4 possible combinations
            let startsWithPercent = '' + (+/^%/.test(columnValue));
            let endsWithPercent = '' + (+/%$/.test(columnValue));
            switch (startsWithPercent + endsWithPercent) {
              case '00':
                filter.operator = 'is exactly';
                filter.value = columnValue.replace('\\%', '%');
                break;
              case '01':
                filter.operator = 'begins with';
                filter.value = columnValue.replace(/%$/, '').replace('\\%', '%');
                break;
              case '10':
                filter.operator = 'ends with';
                filter.value = columnValue.replace(/^%/, '').replace('\\%', '%');
                break;
              case '11':
                filter.operator = 'contains';
                filter.value = columnValue.replace(/^%/, '').replace(/%$/, '').replace('\\%', '%');
                break;
            }
          }
        } else {
          throw new Error(`Expected key to be "$eq" or "$iLike", got "${sequelizeOperator}"`);
        }
        return filter;
      });
    }

    this.getDataSources();
  },
  data: {
    columns: settings.columns,
    dataSources: null,
    selectedDataSource: null,
    selectedColumns: initialResult ? initialResult.columns : {},
    applyFilters: initialResult ? initialResult.applyFilters : false,
    showFilters: false,
    operators: ['is exactly', 'contains', 'begins with', 'ends with', 'like'],
    loadingError: null,
    filters: []
  },
  computed: {
    typeaheadData() {
      let bloodhound = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.obj.whitespace('name'),
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        local: this.selectedDataSource.columns.map((entry, index) => ({id: index, name: entry})),
        identify: (obj) => obj.id
      });
      bloodhound.initialize();
      return {
        typeaheadjs: {
          name: 'columns',
          displayKey: 'name',
          valueKey: 'name',
          source: bloodhound.ttAdapter()
        }
      };
    },
    result() {
      try {
        let columns = this.selectedColumns;
        let columnsCompact = [];
        for (let key in columns) {
          if (columns.hasOwnProperty(key)) {
            let val = columns[key];
            if (val && val.length) {
              if (typeof val === 'object') {
                for (let entry of val) {
                  columnsCompact.push(entry);
                }
              } else {
                columnsCompact.push(val);
              }
            }
          }
        }
        let filterData = [];
        if (this.applyFilters) {
          for (let filter of this.filters) {
            let filterDataEntry;
            switch (filter.operator) {
              case 'is exactly': {
                if (filter.ignoreCase) {
                  filterDataEntry = {
                    $iLike: filter.value.replace('%', '\\%')
                  };
                } else {
                  filterDataEntry = {
                    $eq: filter.value
                  };
                }
                break;
              }
              case 'contains': {
                filterDataEntry = {
                  $iLike: `%${filter.value.replace('%', '\\%')}%`
                };
                break;
              }
              case 'begins with': {
                filterDataEntry = {
                  $iLike: `${filter.value.replace('%', '\\%')}%`
                };
                break;
              }
              case 'ends with': {
                filterDataEntry = {
                  $iLike: `%${filter.value.replace('%', '\\%')}`
                };
                break;
              }
              case 'like': {
                filterDataEntry = {
                  $iLike: filter.value.slice(0, 1) + filter.value.slice(1, -1).replace('%', '\\%') + filter.value.slice(-1)
                };
                break;
              }
            }
            filterData.push({
              [filter.column]: filterDataEntry
            });
          }
        }
        return {
          applyFilters: this.applyFilters,
          hideFilters: this.hideFilters,
          dataSourceId: this.selectedDataSource.id,
          filters: {
            $and: filterData
          },
          columns: columns,
          columnsCompact: columnsCompact
        };
      } catch (e) {
        return `Unable to compute result: ${e}`;
      }
    }
  },
  watch: {
    filters(arr) {
      console.log('filters')
      if (arr.length === 0 && this.showFilters && this.selectedDataSource) {
        this.addDefaultFilter();
      }
    },
    applyFilters(val) {
      console.log('applyFilters')
      if (val === true && this.filters.length === 0) {
        this.addDefaultFilter();
      }
      this.showFilters = val;
    }
  },
  methods: {
    getDataSources() {
      return Fliplet.DataSources.get()
          .then((data) => {
            // setTimeout(() => {
              this.loadingError = null;
              this.dataSources = data;
              console.log(`dataSources:`, JSON.parse(JSON.stringify(data)));

              if (initialResult) {
                this.selectedDataSource = _.find(data, {id: initialResult.dataSourceId});
              }
            // }, 3000);
          })
          .catch((err) => {
            console.error(err);
            this.loadingError = err;
          });
    },
    addDefaultFilter() {
      console.log('addDefaultFilter')
      this.filters.push({
        column: this.selectedDataSource.columns[0],
        operator: 'is exactly',
        value: '',
        ignoreCase: false
      });
      Vue.nextTick(() => window.scrollTo(0, document.body.scrollHeight));
    },
    updateSelectedColumns(key, val) {
      let newSelectedColumns = Object.assign({}, this.selectedColumns);
      if (val && val.length) {
        newSelectedColumns[key] = val;
      } else {
        delete newSelectedColumns[key];
      }
      this.selectedColumns = newSelectedColumns;
    },
    onDataSourceSelection() {
      if (this.selectedDataSource) {
        this.selectedColumns = {};
        this.filters = [];
      }
    }
  },
  components: {
    tagsinput: {
      template: `<input type="text" class="form-control" value="" :trigger-update="tagsinputData"/>`,
      props: ['tagsinputData', 'field', 'updateSelectedColumns', 'initArr'],
      mounted() {
        let $el = $(this.$el).change((event) => this.updateSelectedColumns(this.field.key, $el.tagsinput('items')));
        $el.tagsinput(this.tagsinputData);
        if (this.initArr) {
          $el.tagsinput('add', this.initArr.join(','));
        }
      },
      updated() {
        let $el = $(this.$el);
        $el.tagsinput('removeAll');
        $el.tagsinput('destroy');
        $el.tagsinput(this.tagsinputData);
      }
    }
  }
});

// Fired when the external save button is clicked
Fliplet.Widget.onSaveRequest(() => {

  // Send back the result
  Fliplet.Widget.save(JSON.parse(JSON.stringify({
    settings: settings,
    result: app.result
  }))).then(() => {
    // Tell the UI this widget has finished
    Fliplet.Widget.complete();
  });
});