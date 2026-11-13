import test from 'node:test';
import assert from 'node:assert/strict';
import {stakeholderSearchLinks,linkedInCompanySlug} from '../../src/interfaces/http/rendering.js';
test('both LinkedIn routes are produced',()=>{
 const r=stakeholderSearchLinks({organisationName:'Mott MacDonald',jobLocation:'Reading, England, United Kingdom',organisationUrl:'https://www.linkedin.com/company/mott-macdonald/'});
 assert.equal(r.global[0].url,'https://www.linkedin.com/search/results/people/?keywords=Mott%20MacDonald%2C%20Reading%2C%20England%2C%20United%20Kingdom%2C%20Director&origin=GLOBAL_SEARCH_HEADER');
 assert.equal(r.company[0].url,'https://www.linkedin.com/company/mott-macdonald/people/?keywords=director');
 assert.equal(r.company.length,4);assert.equal(r.slugGuessed,false);
});
test('slug from stakeholder source, else guessed from name',()=>{
 assert.equal(linkedInCompanySlug('','https://uk.linkedin.com/company/version-1/people/'),'version-1');
 const g=stakeholderSearchLinks({organisationName:'Mott MacDonald'});assert.equal(g.slug,'mott-macdonald');assert.equal(g.slugGuessed,true);
 assert.deepEqual(stakeholderSearchLinks({}).company,[]);
});
