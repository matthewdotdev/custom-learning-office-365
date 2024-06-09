import * as React from 'react';
import { Logger, LogLevel } from "@pnp/logging";

import isEqual from "lodash-es/isEqual";
import find from "lodash-es/find";
import findIndex from "lodash-es/findIndex";
import includes from "lodash-es/includes";
import cloneDeep from "lodash-es/cloneDeep";
import filter from "lodash-es/filter";
import indexOf from "lodash-es/indexOf";
import forEach from "lodash-es/forEach";
import HOODialog from '@n8d/htwoo-react/HOODialog';
import HOODialogHeader from '@n8d/htwoo-react/HOODialogHeader';
import HOODialogContent from '@n8d/htwoo-react/HOODialogContent';
import HOOLabel from '@n8d/htwoo-react/HOOLabel';

import styles from "../../common/CustomLearningCommon.module.scss";
import * as strings from "M365LPStrings";
import { params } from "../../common/services/Parameters";
import { UXService } from '../../common/services/UXService';
import { IPlaylist, ICategory, IHistoryItem, HistoryItem, IAsset, IFilterValue, IFilter, FilterValue, Filter, IMultilingualString } from '../../common/models/Models';
import { Templates, FilterTypes, WebpartModeOptions } from '../../common/models/Enums';
import Categories from './Organisms/Categories';
import SubCategories from './Templates/SubCategories';
import LearningHeader from './Templates/LearningHeader';
import AssetView from './Atoms/AssetView';
import PlaylistControl from "./Molecules/PlaylistControl";

export interface ICustomLearningProps {
  editMode: boolean;
  startType: string;
  startLocation: string;
  startAsset: string;
  webpartTitle: string;
  customSort: boolean;
  customSortOrder: string[];
  teamsEntityId: string;
  updateCustomSort: (customSortOrder: string[]) => void;
  alwaysShowSearch: boolean;
}

export interface ICustomLearningState {
  template: string;
  templateId: string;
  parent: ICategory;
  detail: ICategory[] | IPlaylist[] | IPlaylist;
  assets: IAsset[];
  currentAsset: IAsset;
  history: IHistoryItem[];
  filterValue: IFilter;
  filterValues: IFilterValue[];
  url: string;
  renderPanel: boolean;
  fullSizeAsset: boolean;
}

export class CustomLearningState implements ICustomLearningState {
  constructor(
    public template: string = "",
    public templateId: string = "",
    public parent: ICategory = null,
    public detail: ICategory[] | IPlaylist[] | IPlaylist = null,
    public assets: IAsset[] = null,
    public currentAsset: IAsset = null,
    public history: IHistoryItem[] = [],
    public filterValue: IFilter = new Filter(),
    public filterValues: IFilterValue[] = [],
    public url: string = "",
    public renderPanel: boolean = false,
    public fullSizeAsset: boolean = false
  ) { }
}

export default class CustomLearning extends React.Component<ICustomLearningProps, ICustomLearningState> {
  private LOG_SOURCE: string = "CustomLearning";
  private _reInit: boolean = false;

  private teamsContext: boolean = false;
  private teamsContextUrl: string = "";

  constructor(props) {
    super(props);
    this.state = new CustomLearningState();
    UXService.ShowSearchResults = this._loadSearchResultAsset;
    this.teamsContext = props.teamsEntityId && props.teamsEntityId.length > 0;
    // TODO double check the unfurling syntax for Teams V2
    if (this.teamsContext)
      this.teamsContextUrl = `https://teams.microsoft.com/l/entity/141d4ab7-b6ca-4bf4-ac59-25b7bf93642d/${props.teamsEntityId}?context={"subEntityId":`;
    this._init();
  }

  private _findParentCategory(id: string, categories: ICategory[], lastParent: ICategory[]): ICategory[] {
    const parent: ICategory[] = lastParent;
    try {
      for (let i = 0; i < categories.length; i++) {
        if (categories[i].SubCategories.length > 0) {
          let found: boolean = false;
          for (let j = 0; j < categories[i].SubCategories.length; j++) {
            if (categories[i].SubCategories[j].Id == id) {
              found = true;
              parent.push(categories[i].SubCategories[j]);
              break;
            }
          }
          if (found) {
            parent.push(categories[i]);
            break;
          }
        }
      }
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_findParentCategory) - ${err}`, LogLevel.Error);
    }
    return parent;
  }

  private _init(): void {
    if (UXService.WebPartMode === WebpartModeOptions.contentonly) { return; }
    try {
      //If startLocation is specified then pin starting location as root menu item
      //else, pin 'Home' as root menu location
      if (this.props.startLocation.length < 1) {
        //During constructor, update state directly.
        this.state.history.push(new HistoryItem("", strings.NavigationHome, ""));
      }
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_init) - ${err}`, LogLevel.Error);
    }
  }

  public componentDidUpdate(): void {
    if (this._reInit) {
      this._reInit = false;
      this._loadDetail(this.props.startType, this.props.startLocation, []);
    }
  }

  public shouldComponentUpdate(nextProps: Readonly<ICustomLearningProps>, nextState: Readonly<ICustomLearningState>): boolean {
    if ((isEqual(nextState, this.state) && isEqual(nextProps, this.props)))
      return false;
    if (this.props.startType != nextProps.startType ||
      this.props.startLocation != nextProps.startLocation ||
      this.props.customSort != nextProps.customSort ||
      !isEqual(nextProps.customSortOrder, this.props.customSortOrder))
      this._reInit = true;
    return true;
  }

  public componentDidMount(): void {
    this._loadDetail(this.props.startType, this.props.startLocation, this.state.history);
  }

  private _getFilterValues(subcategory: ICategory): IFilterValue[] {
    const filterValues: IFilterValue[] = [];
    try {
      let foundAudience = -1;
      let foundLevel = -1;
      const checkPlaylists = (playlists: IPlaylist[]): void => {
        for (let i = 0; i < playlists.length; i++) {
          if (playlists[i].AudienceId && playlists[i].AudienceId.length > 0) {
            foundAudience = findIndex(filterValues, { Type: FilterTypes.Audience, Key: playlists[i].AudienceId });
            if (foundAudience < 0)
              filterValues.push(new FilterValue(FilterTypes.Audience, playlists[i].AudienceId, playlists[i].AudienceValue.Name));
          } else {
            foundAudience = findIndex(filterValues, { Type: FilterTypes.Audience, Key: "" });
            if (foundAudience < 0)
              filterValues.push(new FilterValue(FilterTypes.Audience, "", strings.FilterNotSet));
          }
          if (playlists[i].LevelId.length > 0) {
            foundLevel = findIndex(filterValues, { Type: FilterTypes.Level, Key: playlists[i].LevelId });
            if (foundLevel < 0)
              filterValues.push(new FilterValue(FilterTypes.Level, playlists[i].LevelId, playlists[i].LevelValue.Name));
          } else {
            foundLevel = findIndex(filterValues, { Type: FilterTypes.Level, Key: "" });
            if (foundLevel < 0)
              filterValues.push(new FilterValue(FilterTypes.Level, "", strings.FilterNotSet));
          }
        }
      };

      const subs: ICategory[] = (subcategory.SubCategories.length == 0) ? [subcategory] : subcategory.SubCategories;
      for (let i = 0; i < subs.length; i++) {
        const pl = filter(UXService.CacheConfig.CachedPlaylists, { CatId: subs[i].Id });
        if (pl.length > 0)
          checkPlaylists(pl);
      }
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_getFilterValues) - ${err}`, LogLevel.Error);
    }

    return filterValues;
  }

  private _filterPlaylists = (playlists: IPlaylist[], filterValue: IFilter): IPlaylist[] => {
    try {
      const filtered: IPlaylist[] = playlists.filter((pl) => {
        let retVal = true;
        if (filterValue.Level.length > 0)
          retVal = includes(filterValue.Level, pl.LevelId);
        if (filterValue.Audience.length > 0 && retVal)
          retVal = includes(filterValue.Audience, pl.AudienceId);
        return retVal;
      });
      return filtered;
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_filterPlaylists) - ${err}`, LogLevel.Error);
      return [];
    }
  }

  private _applyCustomSort = (array: (ICategory[] | IPlaylist[])): (ICategory[] | IPlaylist[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newArray: any = [];
    try {
      if (!this.props.customSortOrder || this.props.customSortOrder.length < 1) { return array; }
      const copyArray = cloneDeep(array);
      forEach(this.props.customSortOrder, (sortId) => {
        let idx: number = -1;
        forEach(copyArray, (value: (ICategory | IPlaylist), index: number) => {
          if (value.Id === sortId) {
            idx = index;
            return false;
          }
        });
        if (idx > -1) {
          const detailItem = cloneDeep(copyArray[idx]);
          newArray.push(detailItem);
          copyArray.splice(idx, 1);
        }
      });
      forEach(copyArray, (item) => {
        newArray.push(item);
      });
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_applyCustomSort) - ${err}`, LogLevel.Error);
      return array;
    }
    return newArray;
  }

  private _loadDetail = (template: string, templateId: string, history?: IHistoryItem[], filterValue?: IFilter, assetId?: string): void => {
    try {
      if (!history) {
        history = cloneDeep(this.state.history);
      }
      let updateHistory: boolean = true;
      if (!filterValue) {
        filterValue = new Filter();
      } else {
        updateHistory = false;
      }

      //Continue loading
      let parent: ICategory;
      let detail: ICategory[] | IPlaylist[] | IPlaylist;
      let assets: IAsset[] = null;
      const currentAsset: IAsset = null;
      let filterValues: IFilterValue[] = cloneDeep(this.state.filterValues);
      let url: string = `${params.baseViewerUrl}?cdn=${UXService.CDN}`;
      let teamsContext: string[] = [];
      if (this.teamsContext) {
        //url is for teams context
        url = this.teamsContextUrl;
        teamsContext = ["", UXService.CDN, "", "", "", ""];
      }
      switch (template) {
        case Templates.Category:
          detail = filter(UXService.CacheConfig.Categories, { Id: templateId });
          if (this.props.customSort)
            detail[0].SubCategories = this._applyCustomSort(detail[0].SubCategories) as ICategory[];
          history.push(new HistoryItem(detail[0].Id, detail[0].Name as string, template));
          if (detail.length === 1) {
            if (this.teamsContext) {
              teamsContext[2] = detail[0].Id;
            } else {
              url = `${url}&category=${detail[0].Id}`;
            }
          }
          break;
        case Templates.SubCategory:
        case Templates.Playlists:
          parent = this._findParentCategory(templateId, UXService.CacheConfig.Categories, [])[0];
          filterValues = this._getFilterValues(parent);
          if (parent.SubCategories.length > 0) {
            template = Templates.SubCategory;
            detail = parent.SubCategories;
            if (this.props.customSort)
              detail = this._applyCustomSort(detail) as ICategory[];
          } else {
            template = Templates.Playlists;
            detail = filter(UXService.CacheConfig.CachedPlaylists, { CatId: parent.Id });
            detail = this._filterPlaylists(detail, filterValue);
            if (this.props.customSort)
              detail = this._applyCustomSort(detail) as IPlaylist[];
          }
          if (updateHistory) {
            history.push(new HistoryItem(parent.Id, parent.Name as string, template));
          }
          if (this.teamsContext) {
            teamsContext[3] = parent.Id;
          } else {
            url = `${url}&subcategory=${parent.Id}`;
          }
          break;
        case Templates.Playlist:
          detail = find(UXService.CacheConfig.CachedPlaylists, { Id: templateId });
          history.push(new HistoryItem(detail.Id, (detail.Title instanceof Array) ? (detail.Title as IMultilingualString[])[0].Text : detail.Title as string, Templates.Playlist));
          if (this.teamsContext) {
            teamsContext[4] = detail.Id;
          } else {
            url = `${url}&playlist=${detail.Id}`;
          }
          assets = [];
          for (let i = 0; i < (detail as IPlaylist).Assets.length; i++) {
            const pa = find(UXService.CacheConfig.CachedAssets, { Id: (detail as IPlaylist).Assets[i] });
            if (pa)
              assets.push(pa);
          }
          break;
        case Templates.Asset:
          assets = [];
          assets.push(find(UXService.CacheConfig.CachedAssets, { Id: templateId }));
          break;
        default:
          detail = UXService.CacheConfig.Categories;
          template = Templates.Category;
      }

      //If Teams context then generate subEntityId for url
      if (this.teamsContext) {
        const subEntityId = teamsContext.join(":");
        url = `${url}"${subEntityId}"}`;
        //encode teams subentity
        const encode = url.split("?");
        url = `${encode[0]}?${encodeURI(encode[1])}`;
      }

      this.setState({
        template: template,
        templateId: templateId,
        parent: parent,
        detail: detail,
        assets: assets,
        currentAsset: currentAsset,
        history: history,
        filterValues: filterValues,
        filterValue: filterValue,
        url: url
      }, () => {
        //For playlist, initialize the starting asset.
        if ((this.state.template === Templates.Playlist)) {
          if (this.state.assets.length > 0) {
            if (!assetId) {
              if (this.props.startLocation === (this.state.detail as IPlaylist).Id && (this.props.startAsset && this.props.startAsset.length > 0)) {
                assetId = this.props.startAsset;
              } else {
                assetId = this.state.assets[0].Id;
              }
            }
            this._selectAsset(assetId);
          }
        } else if ((this.state.template === Templates.Asset) && (this.state.assets.length > 0)) {
          this._selectAsset(templateId);
        }
      });
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (loadDetail) - ${err}`, LogLevel.Error);
    }
  }

  private _historyClick = (template: string, templateId: string, nav?: boolean): void => {
    try {
      let history = cloneDeep(this.state.history);
      if (nav) {
        //Update history to remove items
        if (templateId === "") {
          history = [new HistoryItem("", strings.NavigationHome, "")];
        } else {
          const idx = findIndex(history, { Id: templateId });
          history.splice(idx, (history.length - idx));
        }
      }
      this._loadDetail(template, templateId, history);
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_historyClick) - ${err}`, LogLevel.Error);
    }
  }

  private _selectAsset = (assetId: string): void => {
    try {
      const currentAsset = find(this.state.assets, { Id: assetId });
      if (!isEqual(currentAsset, this.state.currentAsset)) {
        let url: string = `${params.baseViewerUrl}?cdn=${UXService.CDN}`;
        if (this.teamsContext) {
          const teamsContext: string[] = ["", UXService.CDN, "", "", (this.state.detail != null) ? (this.state.detail as IPlaylist).Id : "", currentAsset.Id];
          const subEntityId = teamsContext.join(":");
          url = `${this.teamsContextUrl}"${subEntityId}"}`;
          //encode teams subentity
          const encode = url.split("?");
          url = `${encode[0]}?${encodeURI(encode[1])}`;
        } else {
          if (this.state.detail != null) {
            url = `${url}&playlist=${(this.state.detail as IPlaylist).Id}&asset=${currentAsset.Id}`;
          } else {
            url = `${url}&asset=${currentAsset.Id}`;
          }
        }
        this.setState({
          url: url,
          currentAsset: currentAsset
        }, () => {
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        });
      }
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_selectAsset) - ${err}`, LogLevel.Error);
    }
  }

  private _setFilter = (newFilterValue: IFilterValue): void => {
    try {
      const filterValue: IFilter = cloneDeep(this.state.filterValue);
      let levelIdx = -1;
      let audIdx = -1;
      switch (newFilterValue.Type) {
        case "Level":
          levelIdx = indexOf(filterValue.Level, newFilterValue.Key);
          if (levelIdx > -1) {
            filterValue.Level.splice(levelIdx, 1)
          } else {
            filterValue.Level.push(newFilterValue.Key);
          }
          break;
        case "Audience":
          audIdx = indexOf(filterValue.Audience, newFilterValue.Key);
          if (audIdx > -1) {
            filterValue.Audience.splice(audIdx, 1)
          } else {
            filterValue.Audience.push(newFilterValue.Key);
          }
          break;
      }

      this._loadDetail(this.state.template, this.state.templateId, this.state.history, filterValue);
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_setFilter) - ${err}`, LogLevel.Error);
    }
  }

  private onAdminPlaylists = (): void => {
    window.open(params.baseAdminUrl, '_blank');
  }

  private _loadSearchResultAsset = (subcategoryId: string, playlistId: string, assetId: string): void => {
    try {
      const history = cloneDeep(this.state.history);
      if (history.length > 1)
        history.splice(1);
      if (playlistId) {
        this._loadDetail(Templates.Playlist, playlistId, history, undefined, assetId);
      } else if (subcategoryId) {
        this._loadDetail(Templates.SubCategory, subcategoryId, history);
      }
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_loadSearchResultAsset) - ${err}`, LogLevel.Error);
    }
  }

  private _doRenderPanel = (): void => {
    this.setState({ renderPanel: !this.state.renderPanel });
  }

  private _renderContainer(): (JSX.Element | null) {
    let element: (JSX.Element | null) = null;
    try {
      switch (this.state.template) {
        case Templates.Category:
          element = <Categories
            detail={this.state.detail as ICategory[]}
            editMode={this.props.editMode}
            customSort={this.props.customSort && (this.state.history.length == 1)}
            selectItem={this._loadDetail}
            updateCustomSort={this.props.updateCustomSort}
          />;
          break;
        case Templates.SubCategory:
        case Templates.Playlists:
          element = <SubCategories
            parent={this.state.parent}
            template={this.state.template}
            detail={this.state.detail as ICategory[] | IPlaylist[]}
            filterValue={this.state.filterValue}
            filterValues={this.state.filterValues}
            editMode={this.props.editMode}
            customSort={this.props.customSort && (this.state.history.length == 1)}
            selectItem={this._loadDetail}
            setFilter={this._setFilter}
            updateCustomSort={this.props.updateCustomSort}
          />;
          break;
        case Templates.Playlist:
        case Templates.Asset:
          element = <AssetView
            playlistId={(this.state.detail) ? (this.state.detail as IPlaylist).Id : ""}
            playlistName={(this.state.detail) ? (this.state.detail as IPlaylist).Title as string : ""}
            asset={this.state.currentAsset}
            assets={this.state.assets}
            assetOrigins={UXService.CacheConfig.AssetOrigins}
            selectAsset={this._selectAsset}
          />;
          break;
        default:
          element = <Categories
            detail={this.state.detail as ICategory[]}
            editMode={this.props.editMode}
            customSort={this.props.customSort}
            selectItem={this._loadDetail}
            updateCustomSort={this.props.updateCustomSort}
          />;
      }
    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_renderContainer) - ${err}`, LogLevel.Error);
    }
    return element;
  }

  private _renderPanel = (inPanel: boolean): (JSX.Element | null) => {
    const element: (JSX.Element | null)[] = [];
    try {
      if (!inPanel && (UXService.WebPartMode === WebpartModeOptions.contentonly) && (this.props.webpartTitle && this.props.webpartTitle.length > 0)) {
        element.push(<h2 className={styles.title}>{this.props.webpartTitle}</h2>);
      }
      if (!inPanel) {
        element.push(<LearningHeader
          template={this.state.template}
          detail={((this.state.template === Templates.Playlist) ? this.state.detail : null) as IPlaylist}
          history={this.state.history}
          historyClick={this._historyClick}
          selectAsset={this._selectAsset}
          assets={this.state.assets}
          currentAsset={this.state.currentAsset}
          linkUrl={this.state.url}
          onAdminPlaylists={this.onAdminPlaylists}
          //webpartMode={this.props.webpartMode}
          webpartTitle={this.props.webpartTitle}
          alwaysShowSearch={this.props.alwaysShowSearch}
        />);
      }
      if ((this.state.template === Templates.Playlist)) {
        element.push(<PlaylistControl
          currentAsset={this.state.currentAsset}
          assets={this.state.assets}
          selectAsset={this._selectAsset}
          renderPanel={this._doRenderPanel}
        />);
      }
      element.push(this._renderContainer());

    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (_renderPanel) - ${err}`, LogLevel.Error);
    }

    const mainElement = <div className={`${styles.customLearning} ${(params.appPartPage) ? styles.appPartPage : ""}`}>{element}</div>;

    return mainElement;
  }

  public render(): React.ReactElement<ICustomLearningProps> {
    console.debug('Windows', window);
    if (!this.state.template) return null;
    try {
      //TODO Check to see if this needs the styles added back in
      return (
        <>
          {this.state.renderPanel &&

            <HOODialog
              changeVisibility={() => { this.setState({ renderPanel: !this.state.renderPanel }); }}
              type={8} visible={false}
            >
              <HOODialogHeader
                closeIconName="hoo-icon-close"
                closeOnClick={() => { this.setState({ renderPanel: false }); }}
                title="Dialog Header" closeDisabled={false} />
              <HOODialogContent>
                <HOOLabel label={(this.state.detail) ? (this.state.detail as IPlaylist).Title as string : ""} />
                {this._renderPanel(true)}
              </HOODialogContent>
            </HOODialog>
          }
          {!this.state.renderPanel &&
            this._renderPanel(false)
          }
        </>
      );

    } catch (err) {
      Logger.write(`🎓 M365LP:${this.LOG_SOURCE} (render) - ${err}`, LogLevel.Error);
      return null;
    }
  }
}