import * as UITools from './common.js';
import {Model, Hotel} from './model.js';
import {Storage, StorageException} from './storage.js';
import {ACL_ACCESS_MODES, createSafeRuleset, Ruleset} from './acl_manager.js';
import {PopupBuilder} from '../libs/popup_builder.js';
import {createContentPopup} from '../utils/content.popup.js';
import {createTextPopup} from '../utils/text.popup.js';

const popupUri = '/pages/popup.html';


const CONTROLS = UITools.findNodes();
const _storage = new Storage();


window._storage = _storage;
window._controls = CONTROLS;


// DOM event listeners
UITools.bindEvents(CONTROLS, {
	'click loginBtn': function() {
		solid.auth.popupLogin({ popupUri });
	},
	'click logoutBtn': function() {
		solid.auth.logout();
	},
	'submit navigationForm': function(e) {
		e.preventDefault();
		_storage.url = CONTROLS.navigationUrl.value;
	},
	'click navigationTableBody': function(e){
		let action_s = e.target.dataset.action;

		if (!action_s) return;
		
		let $tr = e.target.closest('tr');

		if (!$tr) return;

		let href_s = $tr.dataset.href;
		let nodeData = _storage.nodeList[parseInt($tr.dataset.id)];

		switch (action_s) {
			case 'navigate': 
				_storage.url = href_s; break;
			case 'show': 
				_storage.getContent(href_s).then((data) => {
					createContentPopup({
						text: data.text
					}).open();
				});
				break;
			case 'edit': 
				if (nodeData.type.indexOf('text/') != -1) {
					_storage.getContent(href_s).then((data) => {
						createTextPopup({
							text: data.text,
							title: href_s,
							onsave: (text_s) => {
								// TODO
								console.log("Save");
								console.dir(text_s);
								_storage.updateFileContent(href_s, text_s, nodeData.type).then(() => {
									console.log('File updated');
								});
							}
						}).open();
					});	
				}
				
				break;
			case 'remove': 
				if (confirm('Are you sure?')) {
					_storage.removeEntry(href_s).then(function(){
						_storage.url = _storage.url;
					});
				}
				break;
			case 'info': 
				_storage.getACLInfo(href_s).then(function(d){
					openRulesetPopup(d);
				});
				break;
			case 'download': 
				let fname_s;
	
				if (nodeData != undefined) {
					fname_s = nodeData && nodeData.name.replace(/\//g, '');
				} else {
					fname_s = 'noname';
				}

				_storage.downloadBlob(href_s).then(function(blob){
					UITools.downloadFile(fname_s, blob);
				});
				break;
			case 'link': 
				UITools.pasteInBuffer(href_s);
				break;
			// case '': break;
		
		}
	},
	'reset navigationForm': function(e) {
		e.preventDefault();
		if (_storage.prevUrl) {
			_storage.url = _storage.prevUrl;
		}
		// _storage.url = CONTROLS.navigationUrl.value;
	},
	'click fileTableSortByModificationTime': function(e) {
		_storage.sort(_storage.sortBy == 'timeUp' ? 'timeDown' : 'timeUp');
	},



	'click btnCreateFolder': function(e) {
		CONTROLS.dialogCreateFolder.setAttribute('open', true);
		setTimeout(function() {
			CONTROLS.dialogCreateFolderName.focus();
		},100);
		
	},
	'submit dialogCreateFolderForm': async function(e) {
		e.preventDefault();
		CONTROLS.dialogCreateFolder.removeAttribute('open');
		await _storage.createFolder(_storage.url, CONTROLS.dialogCreateFolderName.value);
		_storage.url = _storage.url;
	},
	'reset dialogCreateFolderForm': function(e) {
		if (e) e.preventDefault();
		CONTROLS.dialogCreateFolderName.value = '';
		CONTROLS.dialogCreateFolder.removeAttribute('open');
	},

	'click btnShowInfo': async function(){
		_storage.getACLInfo(_storage.url).then(function(d){
			openRulesetPopup(d);
		});
	},
	


	'change btnUpload': function(e) {
		let url_s = _storage.url.replace(/\/?$/, '/');
		
		// Download all files
		Promise.all(
			Array.from(e.target.files).map(function(file){
				if (
					_storage.isDuplicateFileExist(file.name) ? 
					confirm(`There is another file with name '${file.name}'.\nOverwrite it?`) :
					true
				) {
					return _storage
						.upload(url_s + encodeURIComponent(file.name), file)
						.catch(function(e){ return null; });	
				} else {
					return Promise.resolve(true);
				}
			})
		).then(function(){
			// Reload list:
			_storage.url = _storage.url;
			e.target.value = null;
		});
	},


});

_storage.bindEvents({
	'change:url': function(model, url, prevUrl){
		console.log('[change:url] %s', url);
		CONTROLS.navigationUrl.value = url;
		model.showFolder(url);
		model.prevUrl = prevUrl;

	},
	'change:prevUrl': function(model, url) {
		if (url) {
			CONTROLS.navigationBackBtn.removeAttribute('disabled');	
		} else {
			CONTROLS.navigationBackBtn.setAttribute('disabled', true);
		}
	},
	'change:nodeList': function(model, nodes){
		UITools.emptyNode(CONTROLS.navigationTableBody);
		// console.dir(nodes)

		nodes.forEach((node, id) => {
			if (node.type == parent) {

			}
			let $tr = UITools.cr('tr');
			$tr.dataset.id = id;
			$tr.dataset.href = node.uri;
			
			$tr.insertAdjacentHTML('beforeEnd', node.type != 'parent' ? `
				<td><span data-href="${node.uri}" data-action="navigate">${node.name}</span></td>
				<td>${node.type}</td>
				<td>${node.dateModified.toLocaleString()}</td>	
				<td>${node.size}</td>
				<td>
					<i data-action="show" title="Show">[S]</i>
					<i data-action="edit" title="Edit file">[E]</i>
					<i data-action="remove" title="Remove">[R]</i>
					<i data-action="download" title="Download">[D]</i>
					<i data-action="info" title="ACL">[I]</i>
					<i data-action="link" title="Get link">[L]</i>
				</td>
			`: `<td><span data-href="${node.uri}" data-action="navigate">${node.name}</span></td>
				<td colspan="4">&nbsp;</td>`);
			CONTROLS.navigationTableBody.appendChild($tr);	
		});	
	}
})
// Update components to match the user's login status
solid.auth.trackSession(async (session) => {
	const loggedIn_b = !!session;
	
	UITools.toggle(CONTROLS.logoutBlock, loggedIn_b);
	UITools.toggle(CONTROLS.loginBlock, !loggedIn_b);
	UITools.toggle(CONTROLS.loadingBlock, false);

	if (loggedIn_b) {
		CONTROLS.userLabel.textContent = session.webId;

		_storage.url = $rdf.sym(session.webId).site().uri;
		_storage.webId = session.webId;
		_storage.$webId = $rdf.sym(session.webId);
	} else {
		CONTROLS.userLabel.textContent = '';		
	}
});


function addNewRuleset(index) {

}

function openRulesetPopup(d) {
	console.log('openRulesetPopup');
	console.dir(d);

	let popup = new PopupBuilder({
		className: 'm3-dialog __size-a',
		content: `
			<form data-co="form" class="">
				<div class="mb4" data-co="ruleset-list"></div>
				
				<div class="btnline">
					<button class="basebtn __gray" data-co="add">Add new ruleset</button>
					<button type="reset" class="basebtn __gray">Close</button>
					<button type="submit" class="basebtn __blue">Update</button>
				</div>
			</form>
		`,
		events: {
			'form click': function(e) {
				if (e.target.dataset.action == 'removeRuleset') {
					e.stopPropagation();
					let index = parseInt(e.target.dataset.index);
					this.rulesetControls[index] = 0;
					e.target.parentNode.remove();
				}
			},
			'add click': function(e) {
				e.preventDefault();
				this.rulesetControls.push(
					this.renderRuleset(
						createSafeRuleset(d.uri, _storage.webId, d.aclUri), 
						this.rulesetControls.length
					)
				);
			},
			'form submit': function(e){
				e.preventDefault();
				let rulesets = this.rulesetControls.filter(function(r){return r!=0;}).map((controls) => {
					let ruleset = new Ruleset(controls.fieldRulesetId.value);

					ruleset.mode = [];

					if (controls.checkboxRead.checked) ruleset.mode.push(ACL_ACCESS_MODES.read);
					if (controls.checkboxWrite.checked) ruleset.mode.push(ACL_ACCESS_MODES.write);
					if (controls.checkboxControl.checked) ruleset.mode.push(ACL_ACCESS_MODES.control);
					if (controls.checkboxAppend.checked) ruleset.mode.push(ACL_ACCESS_MODES.append);

					ruleset.accessTo = this.parseArray(controls.accessTo.value);
					ruleset.agent = this.parseArray(controls.agent.value);
					ruleset.setAgentClass(this.parseArray(controls.agentClass.value));
					ruleset.setGroup(this.parseArray(controls.group.value));
					ruleset.defaultForNew = this.parseArray(controls.defaultForNew.value);

					return ruleset;
				});


				_storage.updateACL(d.aclUri, rulesets).then(() => {
					this.close();	
				});
				// _storage.setACL(d.aclUri, d.uri).then(() => {
				// 	this.close();	
				// });
			},
			'form reset': function(e){
				e.preventDefault();

				this.close();
			}
		},
	}, {
		parseArray: function(str) {
			let s = str.replace(/\s/g, '');
			return s ? s.split(',') : [];
		},
		onopen: function(view) {
			this.rulesetControls = d.rulesets.map(function(ruleset, rulesetIndex) {
				return view.renderRuleset(ruleset, rulesetIndex);
			});
		},
		onclose: function(view){

		},
		rulesetControls: [],
		renderRuleset: function(ruleset, rulesetIndex) {
			let $tr = UITools.cr('div');

			$tr.className = 'ruleset-item';
			
			$tr.insertAdjacentHTML('beforeEnd', 
			`	<div class="ruleset-item_remove" data-action="removeRuleset" data-index="${rulesetIndex}">[x]</div>
				<label>
					<p class="">Ruleset id:</p>
					<input class="basefield" type="text" data-co="field-ruleset-id" required/>
				</label>
				<div class="mb2">
					<p>Access mode:</p>
					<label>
						<input type="checkbox" data-co="checkbox-read"/><span>Read</span>
					</label>
					<label>
						<input type="checkbox" data-co="checkbox-write"/><span>Write</span>
					</label>
					<label>
						<input type="checkbox" data-co="checkbox-append"/><span>Append</span>
					</label>
					<label>
						<input type="checkbox" data-co="checkbox-control"/><span>Control</span>
					</label>
				</div>
				<div>
					<p>Access to (Enter url of resource - folder or file):</p>
					<textarea class="basefield" data-co="accessTo"></textarea>
				</div>
				<div>
					<p>Granted to users (Enter webId):</p>
					<textarea class="basefield" data-co="agent"></textarea>
				</div>
				<div>
					<p>Granted to groups (Enter group url):</p>
					<textarea class="basefield" data-co="group"></textarea>
				</div>
				<div>
					<p>agentClass (http://xmlns.com/foaf/0.1/Agent for non authorized users):</p>
					<textarea class="basefield" data-co="agentClass"></textarea>
				</div>
				<div>
					<p>defaultForNew (Enter url of resource - folder or file):</p>
					<textarea class="basefield" data-co="defaultForNew"></textarea>
				</div>
			`);

			this.controls.rulesetList.appendChild($tr);	
			let controls = UITools.findNodes($tr);
		
			controls.fieldRulesetId.value = ruleset.id;
			console.log('ruleset.mode');
			console.dir(ruleset.mode);
			console.dir(ACL_ACCESS_MODES);

			(ruleset.mode || []).forEach(function(mode) {
				if (mode.value == ACL_ACCESS_MODES.read.value) controls.checkboxRead.checked = true;
				if (mode.value == ACL_ACCESS_MODES.write.value) controls.checkboxWrite.checked = true;
				if (mode.value == ACL_ACCESS_MODES.control.value) controls.checkboxControl.checked = true;
				if (mode.value == ACL_ACCESS_MODES.append.value) controls.checkboxAppend.checked = true;
			});

			controls.accessTo.value = (ruleset.accessTo || []).join(',\n');
			controls.agent.value = (ruleset.agent || []).join(',\n');
			controls.agentClass.value = (ruleset.agentClass || []).join(',\n');
			controls.defaultForNew.value = (ruleset.defaultForNew || []).join(',\n');
			controls.group.value = (ruleset.agentGroup || []).join(',\n');


			return controls;	
		},
	});

	popup.open();
}